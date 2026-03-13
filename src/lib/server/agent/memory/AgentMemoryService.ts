import type { AgentContext } from '$lib/types/agent';
import type { AgentMemoryRecord, MemoryQueryInput, MemoryWriteInput } from '$lib/types/agentMemory';
import { DBAgentMemoryUtils } from '$lib/server/db/agent';
import { MemoryPolicy } from './MemoryPolicy';
import { MemoryScopeResolver } from './MemoryScopeResolver';
import { MemorySchemaRegistry } from './MemorySchemaRegistry';
import { MEMORY_PROMPT_PREFETCH_LIMIT, MEMORY_READ_TOOL_NAME, MEMORY_WRITE_TOOL_NAME } from './constants';

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
	if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

function parseOccurredAt(value?: string): Date | null {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
	}
	if (typeof value === 'string') {
		const normalized = value.trim();
		return normalized ? [normalized] : [];
	}
	return [];
}

function truncateForTool(value: unknown, depth: number = 0): unknown {
	if (depth > 2) return '[truncated]';
	if (typeof value === 'string') {
		return value.length > 400 ? `${value.slice(0, 397)}...` : value;
	}
	if (Array.isArray(value)) {
		return value.slice(0, 6).map((item) => truncateForTool(item, depth + 1));
	}
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value).slice(0, 8)) {
			result[key] = truncateForTool(nested, depth + 1);
		}
		return result;
	}
	return value;
}

function toToolItem(record: AgentMemoryRecord) {
	return {
		id: record.id,
		memoryType: record.memoryType,
		summary: record.summary,
		payload: truncateForTool(record.payload),
		importance: record.importance,
		occurredAt: record.occurredAt?.toISOString() ?? null,
		tags: record.tags
	};
}

export class AgentMemoryService {
	private static async queryScopedMemories(params: {
		context: AgentContext;
		toolName: string;
		input: MemoryQueryInput;
		operation: 'read' | 'prefetch';
	}) {
		const scope = MemoryScopeResolver.resolve(params.context, params.toolName);
		const { sanitizedInput, ignoredScopeFields } = MemoryPolicy.sanitizeInput(
			params.input as Record<string, unknown>
		);
		const allowedTypes = MemoryPolicy.getReadableMemoryTypes(params.toolName);
		const requestedTypes = Array.isArray(sanitizedInput.memoryTypes)
			? sanitizedInput.memoryTypes.filter(
					(memoryType): memoryType is string =>
						typeof memoryType === 'string' && allowedTypes.includes(memoryType as never)
				)
			: allowedTypes;

		const sinceDays =
			typeof sanitizedInput.sinceDays === 'number' ? Math.max(0, sanitizedInput.sinceDays) : undefined;
		const since = sinceDays !== undefined ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) : undefined;
		const minImportance =
			typeof sanitizedInput.minImportance === 'number'
				? clamp(sanitizedInput.minImportance, 1, 5, 1)
				: undefined;
		const limit =
			typeof sanitizedInput.limit === 'number'
				? clamp(sanitizedInput.limit, 1, 10, params.operation === 'prefetch' ? MEMORY_PROMPT_PREFETCH_LIMIT : 5)
				: params.operation === 'prefetch'
					? MEMORY_PROMPT_PREFETCH_LIMIT
					: 5;
		const tagsAnyNormalized = normalizeStringArray(sanitizedInput.tagsAny);
		const tagsAny = tagsAnyNormalized.length > 0 ? tagsAnyNormalized : undefined;

		const items =
			requestedTypes.length === 0
				? []
				: await DBAgentMemoryUtils.queryMemoriesByScope({
						scopeType: scope.scopeType,
						scopeKey: scope.scopeKey,
						privacyClass: scope.privacyClass,
						memoryTypes: requestedTypes,
						minImportance,
						since,
						limit,
						tagsAny
					});

		await DBAgentMemoryUtils.logAccessEvent({
			actorUserId: params.context.userId,
			toolName: params.toolName,
			operation: params.operation,
			outcome: ignoredScopeFields.length > 0 ? 'ignored_scope_fields' : 'allowed',
			scopeKey: scope.scopeKey,
			resultCount: items.length,
			details: {
				ignoredScopeFields,
				goal: typeof sanitizedInput.goal === 'string' ? sanitizedInput.goal : undefined,
				memoryTypes: requestedTypes
			}
		});

		return { items, ignoredScopeFields };
	}

	static async getStudentActivityMemoryContext(input: MemoryQueryInput, context: AgentContext) {
		const { items, ignoredScopeFields } = await this.queryScopedMemories({
			context,
			toolName: MEMORY_READ_TOOL_NAME,
			input,
			operation: 'read'
		});

		return {
			items: items.map(toToolItem),
			ignoredScopeFields,
			resultCount: items.length
		};
	}

	static async storeStudentActivityMemory(input: MemoryWriteInput, context: AgentContext) {
		const scope = MemoryScopeResolver.resolve(context, MEMORY_WRITE_TOOL_NAME);
		const { sanitizedInput, ignoredScopeFields } = MemoryPolicy.sanitizeInput(
			input as unknown as Record<string, unknown>
		);
		const memoryType =
			typeof sanitizedInput.memoryType === 'string' ? sanitizedInput.memoryType.trim() : '';
		const allowedTypes = MemoryPolicy.getWritableMemoryTypes(MEMORY_WRITE_TOOL_NAME);

		if (!allowedTypes.includes(memoryType as never)) {
			await DBAgentMemoryUtils.logAccessEvent({
				actorUserId: context.userId,
				toolName: MEMORY_WRITE_TOOL_NAME,
				operation: 'write',
				outcome: 'forbidden_memory_type',
				scopeKey: scope.scopeKey,
				resultCount: 0,
				details: { ignoredScopeFields, memoryType }
			});

			return {
				stored: false,
				status: 'rejected' as const,
				reason: `Tipo de memoria no permitido para esta herramienta: ${memoryType || '(vacío)'}.`
			};
		}

		const parsed = MemorySchemaRegistry.parsePayload(memoryType, sanitizedInput.payload);
		if (!parsed.ok) {
			await DBAgentMemoryUtils.logAccessEvent({
				actorUserId: context.userId,
				toolName: MEMORY_WRITE_TOOL_NAME,
				operation: 'write',
				outcome: 'validation_failed',
				scopeKey: scope.scopeKey,
				resultCount: 0,
				details: { ignoredScopeFields, memoryType, error: parsed.error }
			});

			return {
				stored: false,
				status: 'rejected' as const,
				reason: parsed.error
			};
		}

		const summary =
			typeof sanitizedInput.summary === 'string' && sanitizedInput.summary.trim().length > 0
				? sanitizedInput.summary.trim().slice(0, 500)
				: null;
		if (!summary) {
			await DBAgentMemoryUtils.logAccessEvent({
				actorUserId: context.userId,
				toolName: MEMORY_WRITE_TOOL_NAME,
				operation: 'write',
				outcome: 'validation_failed',
				scopeKey: scope.scopeKey,
				resultCount: 0,
				details: { ignoredScopeFields, memoryType, error: 'summary is required' }
			});

			return {
				stored: false,
				status: 'rejected' as const,
				reason: 'La memoria requiere un summary no vacío.'
			};
		}

		const confidence = MemorySchemaRegistry.extractConfidence(memoryType, parsed.payload);
		const shouldReject =
			confidence !== null &&
			typeof parsed.definition.minConfidenceToStore === 'number' &&
			confidence < parsed.definition.minConfidenceToStore;
		const occurredAt = parseOccurredAt(
			typeof sanitizedInput.occurredAt === 'string' ? sanitizedInput.occurredAt : undefined
		);
		const dedupeKey =
			typeof sanitizedInput.dedupeKey === 'string' && sanitizedInput.dedupeKey.trim().length > 0
				? sanitizedInput.dedupeKey.trim().slice(0, 200)
				: undefined;
		const tags = normalizeStringArray(sanitizedInput.tags).slice(0, 12);
		const importance =
			typeof sanitizedInput.importance === 'number'
				? clamp(sanitizedInput.importance, 1, 5, 3)
				: 3;

		const record = await DBAgentMemoryUtils.saveMemory({
			scopeType: scope.scopeType,
			scopeKey: scope.scopeKey,
			privacyClass: scope.privacyClass,
			courseId: scope.courseId,
			activityId: scope.activityId,
			subjectUserId: scope.subjectUserId,
			createdByUserId: scope.createdByUserId,
			sourceKind: 'agent',
			memoryType,
			status: shouldReject ? 'rejected' : 'active',
			importance,
			dedupeKey,
			summary,
			tags,
			payload: parsed.payload,
			occurredAt,
			expiresAt: MemorySchemaRegistry.computeExpiry(memoryType, occurredAt ?? new Date())
		});

		await DBAgentMemoryUtils.logAccessEvent({
			memoryId: record.id,
			actorUserId: context.userId,
			toolName: MEMORY_WRITE_TOOL_NAME,
			operation: 'write',
			outcome: ignoredScopeFields.length > 0 ? 'ignored_scope_fields' : shouldReject ? 'rejected' : 'allowed',
			scopeKey: scope.scopeKey,
			resultCount: shouldReject ? 0 : 1,
			details: { ignoredScopeFields, memoryType, confidence }
		});

		return {
			stored: !shouldReject,
			status: shouldReject ? ('rejected' as const) : ('active' as const),
			reason: shouldReject
				? 'La memoria fue registrada como rechazada por baja confianza.'
				: undefined,
			item: toToolItem(record)
		};
	}

	static async buildPromptMemoryContext(context: AgentContext, goal: string): Promise<string | null> {
		if (!MemoryPolicy.isPromptPrefetchEnabled(context)) {
			return null;
		}

		const { items } = await this.queryScopedMemories({
			context,
			toolName: MEMORY_READ_TOOL_NAME,
			input: { goal, limit: MEMORY_PROMPT_PREFETCH_LIMIT, minImportance: 2 },
			operation: 'prefetch'
		});

		if (items.length === 0) {
			return null;
		}

		const lines = items.map((item) => {
			const occurredAt = item.occurredAt ? item.occurredAt.toISOString().slice(0, 10) : 'sin fecha';
			return `- [${item.memoryType}] (importancia ${item.importance}, ${occurredAt}) ${item.summary}`;
		});

		return [
			'## Recuerdos privados del estudiante en esta actividad',
			'Usa estos recuerdos solo como contexto del estudiante actual en esta actividad.',
			...lines
		].join('\n');
	}
}
