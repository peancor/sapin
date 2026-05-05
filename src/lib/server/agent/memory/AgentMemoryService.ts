import { extractJsonMiddleware, generateText, Output, wrapLanguageModel } from 'ai';
import { z } from 'zod';
import type { AgentContext } from '$lib/types/agent';
import type {
	CanvasScopeProfile,
	MemoryCanvasReadInput,
	MemoryCanvasReadToolResult,
	MemoryCanvasScopeResolved,
	MemoryCanvasUpdateInput,
	MemoryCanvasUpdateToolResult
} from '$lib/types/agentMemory';
import { DBAgentMemoryUtils, DBAgentMessageUtils } from '$lib/server/db/agent';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import { UsageTracker } from '$lib/server/ai/services/UsageTracker';
import { MemoryScopeResolver } from './MemoryScopeResolver';
import {
	getAllCanvasScopeProfiles,
	getAllMemoryToolNames,
	getCanvasScopeProfileByToolName
} from './CanvasScopeRegistry';

const canvasUpdateOutputSchema = z.object({
	status: z.enum(['updated', 'unchanged']),
	newContent: z.string().nullable(),
	changeSummary: z.string().nullable()
});

type CanvasUpdateOutput = z.infer<typeof canvasUpdateOutputSchema>;

const CANVAS_UPDATE_OUTPUT_NAME = 'canvas_update';
const CANVAS_UPDATE_OUTPUT_DESCRIPTION =
	'Actualizacion de un canvas de memoria con las claves status, newContent y changeSummary.';
const CANVAS_UPDATE_OUTPUT_CONTRACT = [
	'## Formato de salida obligatorio',
	'Responde exclusivamente con JSON valido. No uses Markdown, bloques de codigo ni texto adicional.',
	'Usa exactamente estas claves: status, newContent, changeSummary.',
	'status debe ser "updated" o "unchanged".',
	'Si status es "unchanged", newContent debe ser null.',
	'Si status es "updated", newContent debe contener el canvas Markdown completo reescrito.',
	'changeSummary debe ser una frase breve en espanol o null.',
	'',
	'JSON esperado:',
	'{"status":"updated|unchanged","newContent":"string|null","changeSummary":"string|null"}'
].join('\n');

type CanvasScopeStatus = MemoryCanvasScopeResolved & {
	profile: CanvasScopeProfile;
};

type FinalizationBlocker = {
	dirtyScopes: Array<{
		scopeType: MemoryCanvasScopeResolved['scopeType'];
		scopeKey: string;
		updateToolName: string;
		reason: string;
	}>;
};

type RawAgentMessage = Awaited<ReturnType<typeof DBAgentMessageUtils.getAgentMessagesRaw>>[number];

function normalizeOptionalText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function extractNestedText(value: unknown): string | null {
	const directText = normalizeOptionalText(value);
	if (directText) return directText;

	if (Array.isArray(value)) {
		const textItems = value
			.map((item) => extractNestedText(item))
			.filter((item): item is string => item !== null);
		return textItems.length > 0 ? textItems.join('\n').trim() : null;
	}

	const record = asRecord(value);
	if (!record) return null;

	for (const key of ['text', 'content', 'markdown', 'document', 'value']) {
		const nested = extractNestedText(record[key]);
		if (nested) return nested;
	}

	return null;
}

function pickFirstDefined(record: Record<string, unknown>, keys: string[]): unknown {
	for (const key of keys) {
		if (key in record) return record[key];
	}

	return undefined;
}

function normalizeCanvasUpdateStatus(value: unknown): CanvasUpdateOutput['status'] | null {
	if (typeof value !== 'string') return null;

	const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
	if (
		['updated', 'update', 'changed', 'modified', 'rewrite', 'rewritten', 'actualizado', 'cambiado'].includes(
			normalized
		)
	) {
		return 'updated';
	}

	if (
		['unchanged', 'no_change', 'no_changes', 'same', 'sin_cambio', 'sin_cambios', 'igual'].includes(
			normalized
		)
	) {
		return 'unchanged';
	}

	return null;
}

function normalizeCanvasUpdateOutput(value: unknown, currentCanvas: string): CanvasUpdateOutput {
	const record = asRecord(value);
	const contentCandidate = record
		? extractNestedText(
				pickFirstDefined(record, ['newContent', 'new_content', 'content', 'canvas', 'document', 'markdown'])
			)
		: null;
	const summaryCandidate = record
		? extractNestedText(
				pickFirstDefined(record, ['changeSummary', 'change_summary', 'summary', 'reason', 'notes'])
			)
		: null;
	const requestedStatus = record
		? normalizeCanvasUpdateStatus(pickFirstDefined(record, ['status', 'result', 'action']))
		: null;
	const normalizedCurrentCanvas = currentCanvas.trim();

	let status = requestedStatus;
	if (!status) {
		status = contentCandidate !== null && contentCandidate !== normalizedCurrentCanvas ? 'updated' : 'unchanged';
	}

	const newContent =
		status === 'updated' && contentCandidate !== null && contentCandidate !== normalizedCurrentCanvas
			? contentCandidate
			: null;

	return canvasUpdateOutputSchema.parse({
		status: newContent !== null ? 'updated' : 'unchanged',
		newContent,
		changeSummary: summaryCandidate
	});
}

function isMemoryTool(toolName: string): boolean {
	return getAllMemoryToolNames().includes(toolName);
}

function formatTimestamp(value: Date): string {
	return value.toISOString();
}

function formatMessageForTranscript(message: RawAgentMessage): string {
	const createdAt = formatTimestamp(message.createdAt);
	const role = message.role.toUpperCase();
	const toolSuffix = message.toolName ? ` (${message.toolName})` : '';
	const content = (message.textContent ?? '').trim() || '[sin contenido]';
	return `[${createdAt}] ${role}${toolSuffix}: ${content}`;
}

function buildSessionTranscript(messages: RawAgentMessage[]): string {
	if (messages.length === 0) return 'No hay historial previo en esta sesión.';
	return messages.map(formatMessageForTranscript).join('\n');
}

function buildPromptSections(params: {
	scope: CanvasScopeStatus;
	currentCanvas: string;
	transcript: string;
	focus: string | null;
	reason: string | null;
}): string {
	const scopeLabel = params.scope.profile.updateScopeLabel;
	const focusLine = params.focus ? `Foco sugerido por el agente: ${params.focus}` : 'Foco sugerido: ninguno.';
	const reasonLine = params.reason
		? `Motivo de sincronización: ${params.reason}`
		: 'Motivo de sincronización: no indicado.';

	return [
		`Scope: ${scopeLabel}`,
		focusLine,
		reasonLine,
		'',
		'## Canvas actual',
		params.currentCanvas,
		'',
		'## Historial de la sesión',
		params.transcript,
		'',
		CANVAS_UPDATE_OUTPUT_CONTRACT
	].join('\n');
}

export class AgentMemoryService {
	static getEnabledCanvasScopes(context: AgentContext): CanvasScopeStatus[] {
		const enabledToolNames = new Set(context.enabledTools.map((tool) => tool.name));
		return getAllCanvasScopeProfiles()
			.filter(
				(profile) =>
					(enabledToolNames.has(profile.readToolName) ||
						enabledToolNames.has(profile.updateToolName)) &&
					profile.canResolve(context)
			)
			.map((profile) => ({
				...profile.resolve(context),
				profile
			}));
	}

	static isMemoryToolEnabled(context: AgentContext): boolean {
		return this.getEnabledCanvasScopes(context).length > 0;
	}

	static getFinalizationInstruction(context: AgentContext): string | null {
		const scopes = this.getEnabledCanvasScopes(context).filter(
			(scope) => scope.profile.requiresFinalizationGuard
		);
		if (scopes.length === 0) return null;

		const requiredTools = scopes.map((scope) => `\`${scope.profile.updateToolName}\``).join(' y ');
		return `Antes de llamar a la tool de finalización, sincroniza la memoria con ${requiredTools}, espera un resultado exitoso y solo entonces finaliza.`;
	}

	static async executeReadTool(
		toolName: string,
		_input: MemoryCanvasReadInput,
		context: AgentContext
	): Promise<MemoryCanvasReadToolResult> {
		const profile = getCanvasScopeProfileByToolName(toolName);
		if (!isMemoryTool(toolName) || !profile || toolName !== profile.readToolName) {
			throw new Error(`Herramienta de lectura de memoria no soportada: ${toolName}`);
		}

		const scope = MemoryScopeResolver.resolve(context, toolName);
		const canvas = await DBAgentMemoryUtils.getCanvasByScope(scope);

		return {
			scopeType: scope.scopeType,
			scopeKey: scope.scopeKey,
			visibility: scope.visibility,
			scopeBindings: scope.scopeBindings,
			exists: canvas !== null,
			content: canvas?.content ?? null,
			revision: canvas?.revision ?? null,
			updatedAt: canvas?.updatedAt.toISOString() ?? null
		};
	}

	static async executeUpdateTool(
		toolName: string,
		input: MemoryCanvasUpdateInput,
		context: AgentContext,
		toolCallId?: string
	): Promise<MemoryCanvasUpdateToolResult> {
		const profile = getCanvasScopeProfileByToolName(toolName);
		if (!isMemoryTool(toolName) || !profile || toolName !== profile.updateToolName) {
			throw new Error(`Herramienta de actualización de memoria no soportada: ${toolName}`);
		}

		const scope = MemoryScopeResolver.resolve(context, toolName);
		const existingCanvas = await DBAgentMemoryUtils.getCanvasByScope(scope);
		const currentCanvas = existingCanvas?.content ?? profile.buildTemplate();
		const transcript = buildSessionTranscript(await DBAgentMessageUtils.getAgentMessagesRaw(context.chatId));
		const modelName = context.activityConfig.llmModel || (await ModelResolver.getDefaultModel()) || '';

		if (!modelName) {
			await DBAgentMemoryUtils.createSyncEvent({
				scopeType: scope.scopeType,
				scopeKey: scope.scopeKey,
				courseId: scope.courseId,
				activityId: scope.activityId,
				studentId: scope.studentId,
				visibility: scope.visibility,
				scopeBindings: scope.scopeBindings,
				chatId: context.chatId,
				toolCallId,
				status: 'failed',
				errorMessage: 'No hay modelo configurado para actualizar la memoria.'
			});
			throw new Error('No hay modelo configurado para actualizar la memoria.');
		}

		const update = await this.runCanvasUpdater({
			context,
			scope: {
				...scope,
				profile
			},
			currentCanvas,
			transcript,
			focus: normalizeOptionalText(input.focus),
			reason: normalizeOptionalText(input.reason),
			modelName
		});

		const nextContent = normalizeOptionalText(update.newContent);
		const hasMeaningfulChange =
			update.status === 'updated' &&
			nextContent !== null &&
			nextContent !== currentCanvas.trim();

		if (!hasMeaningfulChange) {
			await DBAgentMemoryUtils.createSyncEvent({
				canvasId: existingCanvas?.id ?? null,
				scopeType: scope.scopeType,
				scopeKey: scope.scopeKey,
				courseId: scope.courseId,
				activityId: scope.activityId,
				studentId: scope.studentId,
				visibility: scope.visibility,
				scopeBindings: scope.scopeBindings,
				chatId: context.chatId,
				toolCallId,
				modelName,
				status: 'unchanged',
				changeSummary: normalizeOptionalText(update.changeSummary)
			});

			return {
				scopeType: scope.scopeType,
				scopeKey: scope.scopeKey,
				visibility: scope.visibility,
				scopeBindings: scope.scopeBindings,
				status: 'unchanged',
				stored: false,
				changed: false,
				changeSummary: normalizeOptionalText(update.changeSummary),
				revision: existingCanvas?.revision ?? null,
				updatedAt: existingCanvas?.updatedAt.toISOString() ?? null
			};
		}

		const revision = (existingCanvas?.revision ?? 0) + 1;
		const savedCanvas = await DBAgentMemoryUtils.upsertCanvas({
			...scope,
			content: nextContent,
			revision,
			lastSourceChatId: context.chatId,
			lastSourceToolCallId: toolCallId ?? null,
			lastModelName: modelName
		});

		await DBAgentMemoryUtils.createCanvasRevision({
			canvasId: savedCanvas.id,
			scopeType: savedCanvas.scopeType,
			scopeKey: savedCanvas.scopeKey,
			courseId: savedCanvas.courseId,
			activityId: savedCanvas.activityId,
			studentId: savedCanvas.studentId,
			visibility: savedCanvas.visibility,
			scopeBindings: savedCanvas.scopeBindings,
			revision: savedCanvas.revision,
			content: savedCanvas.content,
			changeSummary: normalizeOptionalText(update.changeSummary),
			sourceChatId: context.chatId,
			sourceToolCallId: toolCallId ?? null,
			modelName
		});

		await DBAgentMemoryUtils.createSyncEvent({
			canvasId: savedCanvas.id,
			scopeType: savedCanvas.scopeType,
			scopeKey: savedCanvas.scopeKey,
			courseId: savedCanvas.courseId,
			activityId: savedCanvas.activityId,
			studentId: savedCanvas.studentId,
			visibility: savedCanvas.visibility,
			scopeBindings: savedCanvas.scopeBindings,
			chatId: context.chatId,
			toolCallId,
			modelName,
			status: 'updated',
			changeSummary: normalizeOptionalText(update.changeSummary)
		});

		return {
			scopeType: savedCanvas.scopeType,
			scopeKey: savedCanvas.scopeKey,
			visibility: savedCanvas.visibility,
			scopeBindings: savedCanvas.scopeBindings,
			status: 'updated',
			stored: true,
			changed: true,
			changeSummary: normalizeOptionalText(update.changeSummary),
			revision: savedCanvas.revision,
			updatedAt: savedCanvas.updatedAt.toISOString()
		};
	}

	static async buildPromptMemoryContext(context: AgentContext): Promise<string | null> {
		const scopes = this.getEnabledCanvasScopes(context);
		if (scopes.length === 0) return null;

		const canvases = await DBAgentMemoryUtils.listCanvasesByScopeKeys(scopes.map((scope) => scope.scopeKey));
		if (canvases.length === 0) return null;

		const byScopeKey = new Map(canvases.map((canvas) => [canvas.scopeKey, canvas]));
		const sections = scopes
			.map((scope) => {
				const canvas = byScopeKey.get(scope.scopeKey);
				if (!canvas) return null;

				return [
					scope.profile.promptHeading,
					`Revision: ${canvas.revision}`,
					canvas.content
				].join('\n');
			})
			.filter((section): section is string => section !== null);

		return sections.length > 0 ? sections.join('\n\n') : null;
	}

	static async getFinalizationBlocker(context: AgentContext): Promise<FinalizationBlocker | null> {
		const scopes = this.getEnabledCanvasScopes(context).filter(
			(scope) => scope.profile.requiresFinalizationGuard
		);
		if (scopes.length === 0) return null;

		const latestUserMessageAt = await DBAgentMemoryUtils.getLatestUserMessageAt(context.chatId);
		if (!latestUserMessageAt) return null;

		const dirtyScopes: FinalizationBlocker['dirtyScopes'] = [];

		for (const scope of scopes) {
			const lastSync = await DBAgentMemoryUtils.getLatestSuccessfulSyncEvent({
				scopeType: scope.scopeType,
				scopeKey: scope.scopeKey,
				chatId: context.chatId
			});

			if (!lastSync || lastSync.createdAt < latestUserMessageAt) {
				dirtyScopes.push({
					scopeType: scope.scopeType,
					scopeKey: scope.scopeKey,
					updateToolName: scope.profile.updateToolName,
					reason: `La memoria requerida de ${scope.profile.updateScopeLabel} aún no está sincronizada para esta sesión.`
				});
			}
		}

		return dirtyScopes.length > 0 ? { dirtyScopes } : null;
	}

	private static async runCanvasUpdater(params: {
		context: AgentContext;
		scope: CanvasScopeStatus;
		currentCanvas: string;
		transcript: string;
		focus: string | null;
		reason: string | null;
		modelName: string;
	}) {
		const startTime = Date.now();
		const quotaCheck = await UsageTracker.checkQuota(
			params.modelName,
			params.context.userId,
			params.context.courseId,
			params.context.activityId
		);

		if (!quotaCheck.allowed) {
			throw new Error(quotaCheck.reason ?? 'Cuota de uso alcanzada para actualizar la memoria.');
		}

		let model;
		try {
			model = await ModelResolver.buildChatModel(params.modelName);
		} catch (error) {
			await UsageTracker.logUsage({
				modelName: params.modelName,
				userId: params.context.userId,
				courseId: params.context.courseId,
				interactiveLearningId: params.context.activityId,
				chatId: params.context.chatId,
				operation: 'completion',
				inputTokens: 0,
				outputTokens: 0,
				durationMs: Date.now() - startTime,
				success: false,
				errorMessage: error instanceof Error ? error.message : 'No se pudo cargar el modelo.',
				metadata: {
					agentMode: true,
					memoryScope: params.scope.scopeType,
					memoryUpdate: true,
					phase: 'model_build'
				}
			});
			throw error;
		}

		try {
			const wrappedModel = wrapLanguageModel({
				model,
				middleware: extractJsonMiddleware()
			});
			const result = await generateText({
				model: wrappedModel,
				temperature: 0,
				output: Output.json({
					name: CANVAS_UPDATE_OUTPUT_NAME,
					description: CANVAS_UPDATE_OUTPUT_DESCRIPTION
				}),
				system:
					'Eres el servicio interno de memoria de un tutor educativo. Mantienes un canvas Markdown como fuente de verdad. Solo debes conservar informacion util, verificable a partir de la sesion y relevante para futuras interacciones. Nunca inventes hechos. Devuelve exclusivamente JSON valido con las claves status, newContent y changeSummary. status debe ser "updated" o "unchanged". Si no hay cambios sustanciales, usa status="unchanged" y newContent=null. Si si los hay, devuelve el documento completo reescrito en newContent.',
				prompt: buildPromptSections({
					scope: params.scope,
					currentCanvas: params.currentCanvas,
					transcript: params.transcript,
					focus: params.focus,
					reason: params.reason
				})
			});

			await UsageTracker.logUsage({
				modelName: params.modelName,
				userId: params.context.userId,
				courseId: params.context.courseId,
				interactiveLearningId: params.context.activityId,
				chatId: params.context.chatId,
				operation: 'completion',
				inputTokens: result.usage?.inputTokens ?? 0,
				outputTokens: result.usage?.outputTokens ?? 0,
				durationMs: Date.now() - startTime,
				success: true,
				metadata: {
					agentMode: true,
					memoryScope: params.scope.scopeType,
					memoryUpdate: true,
					outputMode: 'json'
				}
			});

			return normalizeCanvasUpdateOutput(result.output, params.currentCanvas);
		} catch (error) {
			await UsageTracker.logUsage({
				modelName: params.modelName,
				userId: params.context.userId,
				courseId: params.context.courseId,
				interactiveLearningId: params.context.activityId,
				chatId: params.context.chatId,
				operation: 'completion',
				inputTokens: 0,
				outputTokens: 0,
				durationMs: Date.now() - startTime,
				success: false,
				errorMessage: error instanceof Error ? error.message : 'Error actualizando la memoria.',
				metadata: {
					agentMode: true,
					memoryScope: params.scope.scopeType,
					memoryUpdate: true,
					phase: 'generation',
					outputMode: 'json'
				}
			});

			await DBAgentMemoryUtils.createSyncEvent({
				scopeType: params.scope.scopeType,
				scopeKey: params.scope.scopeKey,
				courseId: params.scope.courseId,
				activityId: params.scope.activityId,
				studentId: params.scope.studentId,
				visibility: params.scope.visibility,
				scopeBindings: params.scope.scopeBindings,
				chatId: params.context.chatId,
				modelName: params.modelName,
				status: 'failed',
				errorMessage: error instanceof Error ? error.message : 'Error actualizando la memoria.'
			});

			throw error;
		}
	}
}
