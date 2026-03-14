import type { AgentContext } from '$lib/types/agent';
import type {
	AgentMemoryRecord,
	MemoryAction,
	UnifiedMemoryToolInput,
	UnifiedMemoryToolResult
} from '$lib/types/agentMemory';
import { DBAgentMemoryUtils } from '$lib/server/db/agent';
import { MemoryPolicy } from './MemoryPolicy';
import { MemoryScopeResolver } from './MemoryScopeResolver';
import { MemorySchemaRegistry } from './MemorySchemaRegistry';
import {
	MEMORY_PROMPT_PREFETCH_LIMIT,
	STUDENT_ACTIVITY_MEMORY_TOOL_NAME,
	STUDENT_COURSE_MEMORY_TOOL_NAME
} from './constants';

const READ_INPUT_KEYS = ['goal', 'memoryTypes', 'tagsAny', 'sinceDays', 'limit', 'minImportance'] as const;
const WRITE_INPUT_KEYS = [
	'memoryType',
	'summary',
	'details',
	'evidence',
	'confidence',
	'payload',
	'importance',
	'occurredAt',
	'dedupeKey',
	'tags'
] as const;

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
		return value
			.filter((item): item is string => typeof item === 'string')
			.map((item) => item.trim())
			.filter(Boolean);
	}
	if (typeof value === 'string') {
		const normalized = value.trim();
		return normalized ? [normalized] : [];
	}
	return [];
}

function normalizeMemoryTypeFilter(value: unknown, allowedTypes: string[]): string[] {
	return normalizeStringArray(value).filter((memoryType) => allowedTypes.includes(memoryType));
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

function getIgnoredActionFields(
	sanitizedInput: Record<string, unknown>,
	action: MemoryAction
): string[] {
	const keysToIgnore = action === 'read' ? WRITE_INPUT_KEYS : READ_INPUT_KEYS;
	return keysToIgnore.filter((key) => key in sanitizedInput);
}

function sanitizeInputForAction(
	sanitizedInput: Record<string, unknown>,
	action: MemoryAction
): { actionInput: Record<string, unknown>; ignoredActionFields: string[] } {
	const ignoredActionFields = getIgnoredActionFields(sanitizedInput, action);
	const actionInput = { ...sanitizedInput };
	delete actionInput.action;
	for (const key of ignoredActionFields) {
		delete actionInput[key];
	}

	return { actionInput, ignoredActionFields };
}

export class AgentMemoryService {
	private static async queryScopedMemories(params: {
		context: AgentContext;
		toolName: string;
		input: Record<string, unknown>;
		operation: 'read' | 'prefetch';
		ignoredScopeFields: string[];
		ignoredActionFields: string[];
	}): Promise<UnifiedMemoryToolResult> {
		const scope = MemoryScopeResolver.resolve(params.context, params.toolName);
		const allowedTypes = MemoryPolicy.getReadableMemoryTypes(params.toolName);
		const requestedTypes = normalizeMemoryTypeFilter(params.input.memoryTypes, allowedTypes);
		const effectiveTypes = requestedTypes.length > 0 ? requestedTypes : allowedTypes;

		const sinceDays =
			typeof params.input.sinceDays === 'number' ? Math.max(0, params.input.sinceDays) : undefined;
		const since = sinceDays !== undefined ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) : undefined;
		const minImportance =
			typeof params.input.minImportance === 'number'
				? clamp(params.input.minImportance, 1, 5, 1)
				: undefined;
		const limit =
			typeof params.input.limit === 'number'
				? clamp(params.input.limit, 1, 10, params.operation === 'prefetch' ? MEMORY_PROMPT_PREFETCH_LIMIT : 5)
				: params.operation === 'prefetch'
					? MEMORY_PROMPT_PREFETCH_LIMIT
					: 5;
		const tagsAnyNormalized = normalizeStringArray(params.input.tagsAny);
		const tagsAny = tagsAnyNormalized.length > 0 ? tagsAnyNormalized : undefined;

		const items =
			effectiveTypes.length === 0
				? []
				: await DBAgentMemoryUtils.queryMemoriesByScope({
						scopeType: scope.scopeType,
						scopeKey: scope.scopeKey,
						privacyClass: scope.privacyClass,
						memoryTypes: effectiveTypes,
						minImportance,
						since,
						limit,
						tagsAny
					});

		await DBAgentMemoryUtils.logAccessEvent({
			actorUserId: params.context.userId,
			toolName: params.toolName,
			operation: params.operation,
			outcome: params.ignoredScopeFields.length > 0 ? 'ignored_scope_fields' : 'allowed',
			scopeKey: scope.scopeKey,
			resultCount: items.length,
			details: {
				ignoredScopeFields: params.ignoredScopeFields,
				ignoredActionFields: params.ignoredActionFields,
				goal: typeof params.input.goal === 'string' ? params.input.goal : undefined,
				memoryTypes: effectiveTypes
			}
		});

		return {
			action: 'read',
			items: items.map(toToolItem),
			ignoredScopeFields: params.ignoredScopeFields,
			ignoredActionFields: params.ignoredActionFields,
			resultCount: items.length
		};
	}

	private static async storeScopedMemory(params: {
		context: AgentContext;
		toolName: string;
		input: Record<string, unknown>;
		ignoredScopeFields: string[];
		ignoredActionFields: string[];
	}): Promise<UnifiedMemoryToolResult> {
		const scope = MemoryScopeResolver.resolve(params.context, params.toolName);
		const allowedTypes = MemoryPolicy.getWritableMemoryTypes(params.toolName);
		const normalized = MemorySchemaRegistry.normalizeWriteProposal(params.input);
		if (!normalized.ok) {
			await DBAgentMemoryUtils.logAccessEvent({
				actorUserId: params.context.userId,
				toolName: params.toolName,
				operation: 'write',
				outcome: 'validation_failed',
				scopeKey: scope.scopeKey,
				resultCount: 0,
				details: {
					ignoredScopeFields: params.ignoredScopeFields,
					ignoredActionFields: params.ignoredActionFields,
					originalSuggestedMemoryType: normalized.originalSuggestedMemoryType,
					inferredMemoryType: normalized.inferredMemoryType,
					normalizationWarnings: normalized.normalizationWarnings,
					error: normalized.error
				}
			});

			return {
				action: 'write',
				stored: false,
				status: 'rejected',
				reason: normalized.error,
				ignoredScopeFields: params.ignoredScopeFields,
				ignoredActionFields: params.ignoredActionFields
			};
		}

		if (!allowedTypes.includes(normalized.memoryType)) {
			await DBAgentMemoryUtils.logAccessEvent({
				actorUserId: params.context.userId,
				toolName: params.toolName,
				operation: 'write',
				outcome: 'forbidden_memory_type',
				scopeKey: scope.scopeKey,
				resultCount: 0,
				details: {
					ignoredScopeFields: params.ignoredScopeFields,
					ignoredActionFields: params.ignoredActionFields,
					memoryType: normalized.memoryType,
					originalSuggestedMemoryType: normalized.originalSuggestedMemoryType,
					inferredMemoryType: normalized.inferredMemoryType,
					fallbackUsed: normalized.fallbackUsed
				}
			});

			return {
				action: 'write',
				stored: false,
				status: 'rejected',
				reason: `Tipo de memoria no permitido para esta herramienta: ${normalized.memoryType}.`,
				ignoredScopeFields: params.ignoredScopeFields,
				ignoredActionFields: params.ignoredActionFields
			};
		}

		const parsed = MemorySchemaRegistry.parsePayload(normalized.memoryType, normalized.payload);
		if (!parsed.ok) {
			await DBAgentMemoryUtils.logAccessEvent({
				actorUserId: params.context.userId,
				toolName: params.toolName,
				operation: 'write',
				outcome: 'validation_failed',
				scopeKey: scope.scopeKey,
				resultCount: 0,
				details: {
					ignoredScopeFields: params.ignoredScopeFields,
					ignoredActionFields: params.ignoredActionFields,
					memoryType: normalized.memoryType,
					originalSuggestedMemoryType: normalized.originalSuggestedMemoryType,
					inferredMemoryType: normalized.inferredMemoryType,
					fallbackUsed: normalized.fallbackUsed,
					normalizationWarnings: normalized.normalizationWarnings,
					error: parsed.error
				}
			});

			return {
				action: 'write',
				stored: false,
				status: 'rejected',
				reason: parsed.error,
				ignoredScopeFields: params.ignoredScopeFields,
				ignoredActionFields: params.ignoredActionFields
			};
		}

		const confidence =
			normalized.confidence ?? MemorySchemaRegistry.extractConfidence(normalized.memoryType, parsed.payload);
		const occurredAt = parseOccurredAt(
			typeof params.input.occurredAt === 'string' ? params.input.occurredAt : undefined
		);
		const dedupeKey =
			typeof params.input.dedupeKey === 'string' && params.input.dedupeKey.trim().length > 0
				? params.input.dedupeKey.trim().slice(0, 200)
				: undefined;
		const tags = normalizeStringArray(params.input.tags).slice(0, 12);
		const requestedImportance =
			typeof params.input.importance === 'number'
				? clamp(params.input.importance, 1, 5, normalized.fallbackUsed ? 2 : 3)
				: normalized.fallbackUsed
					? 2
					: 3;
		const importance =
			confidence !== null && confidence < 0.3 ? Math.max(1, requestedImportance - 1) : requestedImportance;

		const record = await DBAgentMemoryUtils.saveMemory({
			scopeType: scope.scopeType,
			scopeKey: scope.scopeKey,
			privacyClass: scope.privacyClass,
			courseId: scope.courseId,
			activityId: scope.activityId,
			subjectUserId: scope.subjectUserId,
			createdByUserId: scope.createdByUserId,
			sourceKind: 'agent',
			memoryType: normalized.memoryType,
			status: 'active',
			importance,
			dedupeKey,
			summary: normalized.summary,
			tags,
			payload: parsed.payload,
			occurredAt,
			expiresAt: MemorySchemaRegistry.computeExpiry(normalized.memoryType, occurredAt ?? new Date())
		});

		await DBAgentMemoryUtils.logAccessEvent({
			memoryId: record.id,
			actorUserId: params.context.userId,
			toolName: params.toolName,
			operation: 'write',
			outcome: params.ignoredScopeFields.length > 0 ? 'ignored_scope_fields' : 'allowed',
			scopeKey: scope.scopeKey,
			resultCount: 1,
			details: {
				ignoredScopeFields: params.ignoredScopeFields,
				ignoredActionFields: params.ignoredActionFields,
				memoryType: normalized.memoryType,
				originalSuggestedMemoryType: normalized.originalSuggestedMemoryType,
				inferredMemoryType: normalized.inferredMemoryType,
				fallbackUsed: normalized.fallbackUsed,
				normalizationWarnings: normalized.normalizationWarnings,
				confidence,
				originActivityId: params.context.activityId
			}
		});

		return {
			action: 'write',
			stored: true,
			status: 'active',
			item: toToolItem(record),
			ignoredScopeFields: params.ignoredScopeFields,
			ignoredActionFields: params.ignoredActionFields
		};
	}

	static async executeScopedMemoryAction(
		toolName: string,
		input: UnifiedMemoryToolInput,
		context: AgentContext
	): Promise<UnifiedMemoryToolResult> {
		const { sanitizedInput, ignoredScopeFields } = MemoryPolicy.sanitizeInput(
			input as unknown as Record<string, unknown>
		);
		const action = sanitizedInput.action;
		if (action !== 'read' && action !== 'write') {
			throw new Error('La herramienta de memoria requiere action="read" o action="write".');
		}

		if (toolName === STUDENT_COURSE_MEMORY_TOOL_NAME && !context.courseId) {
			return action === 'read'
				? {
						action,
						items: [],
						ignoredScopeFields,
						ignoredActionFields: [],
						resultCount: 0
					}
				: {
						action,
						stored: false,
						status: 'rejected',
						reason: 'La memoria por alumno+curso requiere que la actividad pertenezca a un curso.',
						ignoredScopeFields,
						ignoredActionFields: []
					};
		}

		const { actionInput, ignoredActionFields } = sanitizeInputForAction(sanitizedInput, action);

		if (action === 'read') {
			return this.queryScopedMemories({
				context,
				toolName,
				input: actionInput,
				operation: 'read',
				ignoredScopeFields,
				ignoredActionFields
			});
		}

		return this.storeScopedMemory({
			context,
			toolName,
			input: actionInput,
			ignoredScopeFields,
			ignoredActionFields
		});
	}

	static async buildPromptMemoryContext(context: AgentContext, goal: string): Promise<string | null> {
		if (!MemoryPolicy.isPromptPrefetchEnabled(context)) {
			return null;
		}
		if (!context.courseId) {
			return null;
		}

		const result = await this.queryScopedMemories({
			context,
			toolName: STUDENT_COURSE_MEMORY_TOOL_NAME,
			input: { goal, limit: MEMORY_PROMPT_PREFETCH_LIMIT, minImportance: 2 },
			operation: 'prefetch',
			ignoredScopeFields: [],
			ignoredActionFields: []
		});

		if (!result.items || result.items.length === 0) {
			return null;
		}

		const lines = result.items.map((item) => {
			const occurredAt = item.occurredAt ? item.occurredAt.slice(0, 10) : 'sin fecha';
			return `- [${item.memoryType}] (importancia ${item.importance}, ${occurredAt}) ${item.summary}`;
		});

		return [
			'## Recuerdos privados del estudiante en este curso',
			'Usa estos recuerdos solo como contexto del estudiante actual en este curso.',
			...lines
		].join('\n');
	}
}
