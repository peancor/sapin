import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { AgentContext } from '$lib/types/agent';
import type {
	MemoryCanvasReadInput,
	MemoryCanvasReadToolResult,
	MemoryCanvasScopeResolved,
	MemoryCanvasScopeType,
	MemoryCanvasUpdateInput,
	MemoryCanvasUpdateToolResult
} from '$lib/types/agentMemory';
import { DBAgentMemoryUtils, DBAgentMessageUtils } from '$lib/server/db/agent';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import { UsageTracker } from '$lib/server/ai/services/UsageTracker';
import { MemoryScopeResolver } from './MemoryScopeResolver';
import {
	ACTIVITY_CANVAS_TOOL_NAMES,
	ALL_MEMORY_TOOL_NAMES,
	COURSE_CANVAS_TOOL_NAMES,
	STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME,
	STUDENT_ACTIVITY_CANVAS_UPDATE_TOOL_NAME,
	STUDENT_COURSE_CANVAS_READ_TOOL_NAME,
	STUDENT_COURSE_CANVAS_UPDATE_TOOL_NAME
} from './constants';

const canvasUpdateOutputSchema = z.object({
	status: z.enum(['updated', 'unchanged']),
	newContent: z.string().nullable(),
	changeSummary: z.string().nullable()
});

type CanvasScopeStatus = MemoryCanvasScopeResolved & {
	readToolName: string;
	updateToolName: string;
};

type FinalizationBlocker = {
	dirtyScopes: Array<{
		scopeType: MemoryCanvasScopeType;
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

function isMemoryTool(toolName: string): boolean {
	return ALL_MEMORY_TOOL_NAMES.includes(toolName as (typeof ALL_MEMORY_TOOL_NAMES)[number]);
}

function isReadTool(toolName: string): boolean {
	return (
		toolName === STUDENT_COURSE_CANVAS_READ_TOOL_NAME ||
		toolName === STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME
	);
}

function getScopeTools(scopeType: MemoryCanvasScopeType) {
	return scopeType === 'student_course'
		? {
				readToolName: STUDENT_COURSE_CANVAS_READ_TOOL_NAME,
				updateToolName: STUDENT_COURSE_CANVAS_UPDATE_TOOL_NAME
			}
		: {
				readToolName: STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME,
				updateToolName: STUDENT_ACTIVITY_CANVAS_UPDATE_TOOL_NAME
			};
}

function buildDefaultCanvasTemplate(scopeType: MemoryCanvasScopeType): string {
	if (scopeType === 'student_course') {
		return [
			'# Canvas de memoria del alumno en el curso',
			'',
			'## Perfil actual',
			'- Sin recuerdos consolidados todavía.',
			'',
			'## Preferencias y adaptaciones útiles',
			'- Ninguna observada todavía.',
			'',
			'## Fortalezas',
			'- Ninguna consolidada todavía.',
			'',
			'## Dificultades persistentes',
			'- Ninguna consolidada todavía.',
			'',
			'## Seguimiento pendiente',
			'- Ninguno.'
		].join('\n');
	}

	return [
		'# Canvas de memoria del alumno en la actividad',
		'',
		'## Estado actual',
		'- Sin recuerdos consolidados todavía.',
		'',
		'## Bloqueos y dificultades',
		'- Ninguno consolidado todavía.',
		'',
		'## Progresos y evidencias',
		'- Ninguno consolidado todavía.',
		'',
		'## Siguiente mejor paso',
		'- Continuar observando la interacción.'
	].join('\n');
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
	const scopeLabel =
		params.scope.scopeType === 'student_course'
			? 'alumno + curso'
			: 'alumno + actividad';
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
		params.transcript
	].join('\n');
}

export class AgentMemoryService {
	static async executeScopedMemoryAction(
		_toolName?: string,
		input?: { action?: 'read' | 'write' },
		_context?: AgentContext
	): Promise<{
		action: 'read' | 'write';
		ignoredScopeFields: string[];
		ignoredActionFields: string[];
		stored?: boolean;
		status?: 'rejected';
		reason?: string;
		items?: [];
		resultCount?: number;
	}> {
		return {
			action: input?.action === 'read' ? 'read' : 'write',
			ignoredScopeFields: [],
			ignoredActionFields: [],
			stored: false,
			status: 'rejected',
			reason:
				'La memoria tipada anterior ha sido retirada. Usa las nuevas tools de canvas de lectura y actualización.'
		};
	}

	static getEnabledCanvasScopes(context: AgentContext): CanvasScopeStatus[] {
		const enabledToolNames = new Set(context.enabledTools.map((tool) => tool.name));
		const scopes: CanvasScopeStatus[] = [];

		if (
			COURSE_CANVAS_TOOL_NAMES.some((toolName) => enabledToolNames.has(toolName)) &&
			context.courseId
		) {
			const resolved = MemoryScopeResolver.resolve(context, STUDENT_COURSE_CANVAS_READ_TOOL_NAME);
			scopes.push({
				...resolved,
				...getScopeTools('student_course')
			});
		}

		if (ACTIVITY_CANVAS_TOOL_NAMES.some((toolName) => enabledToolNames.has(toolName))) {
			const resolved = MemoryScopeResolver.resolve(context, STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME);
			scopes.push({
				...resolved,
				...getScopeTools('student_activity')
			});
		}

		return scopes;
	}

	static isMemoryToolEnabled(context: AgentContext): boolean {
		return this.getEnabledCanvasScopes(context).length > 0;
	}

	static getFinalizationInstruction(context: AgentContext): string | null {
		const scopes = this.getEnabledCanvasScopes(context);
		if (scopes.length === 0) return null;

		const requiredTools = scopes.map((scope) => `\`${scope.updateToolName}\``).join(' y ');
		return `Antes de llamar a la tool de finalización, sincroniza la memoria con ${requiredTools}, espera un resultado exitoso y solo entonces finaliza.`;
	}

	static async executeReadTool(
		toolName: string,
		input: MemoryCanvasReadInput,
		context: AgentContext
	): Promise<MemoryCanvasReadToolResult> {
		if (!isMemoryTool(toolName) || !isReadTool(toolName)) {
			throw new Error(`Herramienta de lectura de memoria no soportada: ${toolName}`);
		}

		const scope = MemoryScopeResolver.resolve(context, toolName);
		if (scope.scopeType === 'student_course' && !context.courseId) {
			throw new Error('El canvas de curso requiere que la actividad pertenezca a un curso.');
		}
		const canvas = await DBAgentMemoryUtils.getCanvasByScope(scope);

		return {
			scopeType: scope.scopeType,
			scopeKey: scope.scopeKey,
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
		if (!isMemoryTool(toolName) || isReadTool(toolName)) {
			throw new Error(`Herramienta de actualización de memoria no soportada: ${toolName}`);
		}

		const scope = MemoryScopeResolver.resolve(context, toolName);
		if (scope.scopeType === 'student_course' && !context.courseId) {
			throw new Error('El canvas de curso requiere que la actividad pertenezca a un curso.');
		}
		const existingCanvas = await DBAgentMemoryUtils.getCanvasByScope(scope);
		const currentCanvas = existingCanvas?.content ?? buildDefaultCanvasTemplate(scope.scopeType);
		const transcript = buildSessionTranscript(await DBAgentMessageUtils.getAgentMessagesRaw(context.chatId));
		const modelName = context.activityConfig.llmModel || (await ModelResolver.getDefaultModel()) || '';

		if (!modelName) {
			await DBAgentMemoryUtils.createSyncEvent({
				scopeType: scope.scopeType,
				scopeKey: scope.scopeKey,
				courseId: scope.courseId,
				activityId: scope.activityId,
				studentId: scope.studentId,
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
				...getScopeTools(scope.scopeType)
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
				chatId: context.chatId,
				toolCallId,
				modelName,
				status: 'unchanged',
				changeSummary: normalizeOptionalText(update.changeSummary)
			});

			return {
				scopeType: scope.scopeType,
				scopeKey: scope.scopeKey,
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
			chatId: context.chatId,
			toolCallId,
			modelName,
			status: 'updated',
			changeSummary: normalizeOptionalText(update.changeSummary)
		});

		return {
			scopeType: savedCanvas.scopeType,
			scopeKey: savedCanvas.scopeKey,
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

				const heading =
					scope.scopeType === 'student_course'
						? '## Canvas privado del estudiante en el curso'
						: '## Canvas privado del estudiante en la actividad';

				return [
					heading,
					`Revision: ${canvas.revision}`,
					canvas.content
				].join('\n');
			})
			.filter((section): section is string => section !== null);

		return sections.length > 0 ? sections.join('\n\n') : null;
	}

	static async getFinalizationBlocker(context: AgentContext): Promise<FinalizationBlocker | null> {
		const scopes = this.getEnabledCanvasScopes(context);
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
					updateToolName: scope.updateToolName,
					reason:
						scope.scopeType === 'student_course'
							? 'La memoria del curso aún no está sincronizada para esta sesión.'
							: 'La memoria de la actividad aún no está sincronizada para esta sesión.'
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
			const result = await generateText({
				model,
				temperature: 0,
				output: Output.object({ schema: canvasUpdateOutputSchema }),
				system:
					'Eres el servicio interno de memoria de un tutor educativo. Mantienes un canvas Markdown como fuente de verdad. Solo debes conservar información útil, verificable a partir de la sesión y relevante para futuras interacciones. Nunca inventes hechos. Si no hay cambios sustanciales, responde unchanged. Si sí los hay, devuelve el documento completo reescrito en newContent.',
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
					memoryUpdate: true
				}
			});

			return result.output;
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
					phase: 'generation'
				}
			});

			await DBAgentMemoryUtils.createSyncEvent({
				scopeType: params.scope.scopeType,
				scopeKey: params.scope.scopeKey,
				courseId: params.scope.courseId,
				activityId: params.scope.activityId,
				studentId: params.scope.studentId,
				chatId: params.context.chatId,
				modelName: params.modelName,
				status: 'failed',
				errorMessage: error instanceof Error ? error.message : 'Error actualizando la memoria.'
			});

			throw error;
		}
	}
}
