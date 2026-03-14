import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { db, DBChatUtils } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import { AgentPromptBuilder } from '$lib/server/agent/AgentPromptBuilder';
import { AgentSessionAnalyticsService } from '$lib/server/agent/AgentSessionAnalyticsService';
import { DBAgentActivityUtils } from '$lib/server/db/agent';
import { AIUtils } from '$lib/server/ai/AIUtils';
import type { AgentActivityConfig } from '$lib/types/agent';
import type {
	ActivityDebuggerActivityDetail,
	ActivityDebuggerActivitySummary,
	ActivityDebuggerCourseOption,
	ActivityDebuggerFilters,
	ActivityDebuggerPromptSnapshot,
	ActivityDebuggerRawSection,
	ActivityDebuggerSessionDetail,
	ActivityDebuggerSessionFilters,
	ActivityDebuggerSessionStatus,
	ActivityDebuggerSessionSummary,
	ActivityDebuggerTimelineEvent,
	ActivityDebuggerUsageSummary
} from '$lib/types/activityDebugger';

type AccessContext = {
	actorUserId: string;
	actorHighestRoleLevel?: number;
};

type ActivityRow = typeof schema.interactiveLearning.$inferSelect;
type CourseRow = typeof schema.course.$inferSelect;
type ChatMessageRow = typeof schema.message.$inferSelect;
type UsageLogRow = typeof schema.aiUsageLog.$inferSelect & {
	modelName: string | null;
	modelDisplayName: string | null;
};

function toIsoString(value: Date | string | number | null | undefined): string | null {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseJsonValue(value: unknown): unknown {
	if (typeof value !== 'string') return value ?? null;
	if (!value.trim()) return null;

	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
	const parsed = parseJsonValue(value);
	return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
		? (parsed as Record<string, unknown>)
		: null;
}

function summarizeText(value: string | null | undefined, maxLength = 160): string {
	if (!value) return 'Sin contenido';
	const compact = value.replace(/\s+/g, ' ').trim();
	if (!compact) return 'Sin contenido';
	return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trimEnd()}...` : compact;
}

function safeDateFromFilter(value: string | null | undefined, endOfDay = false): Date | null {
	if (!value) return null;
	const normalized = endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`;
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function matchesSearch(values: Array<string | null | undefined>, search: string | undefined): boolean {
	if (!search?.trim()) return true;
	const needle = search.trim().toLowerCase();
	return values.some((value) => value?.toLowerCase().includes(needle));
}

function summarizeUsage(logs: UsageLogRow[]): ActivityDebuggerUsageSummary {
	if (logs.length === 0) {
		return {
			requestCount: 0,
			successCount: 0,
			failureCount: 0,
			totalTokens: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			totalEstimatedCost: 0,
			averageDurationMs: 0,
			lastModelName: null
		};
	}

	const totalDuration = logs.reduce((sum, log) => sum + (log.durationMs ?? 0), 0);

	return {
		requestCount: logs.length,
		successCount: logs.filter((log) => log.success).length,
		failureCount: logs.filter((log) => !log.success).length,
		totalTokens: logs.reduce((sum, log) => sum + log.totalTokens, 0),
		totalInputTokens: logs.reduce((sum, log) => sum + log.inputTokens, 0),
		totalOutputTokens: logs.reduce((sum, log) => sum + log.outputTokens, 0),
		totalEstimatedCost: logs.reduce((sum, log) => sum + (log.estimatedCost ?? 0), 0),
		averageDurationMs: Math.round(totalDuration / logs.length),
		lastModelName: logs.at(-1)?.modelDisplayName ?? logs.at(-1)?.modelName ?? null
	};
}

function statusRank(status: ActivityDebuggerSessionStatus): number {
	switch (status) {
		case 'attention':
			return 0;
		case 'pending':
			return 1;
		default:
			return 2;
	}
}

function buildStoredPromptValue(label: string, value: string | null) {
	return {
		label,
		value,
		origin: value ? 'stored' : 'unavailable',
		note: value ? null : 'No hay valor persistido'
	} as const;
}

function normalizeAgentConfig(
	config: typeof schema.interactiveLearningAgent.$inferSelect
): AgentActivityConfig {
	return {
		llmModel: config.llmModel,
		llmRole: config.llmRole,
		llmInstructions: config.llmInstructions,
		llmContext: config.llmContext,
		systemPrompt: config.systemPrompt,
		temperature: config.temperature,
		maxTokens: config.maxTokens,
		topP: config.topP,
		maxToolRoundtrips: config.maxToolRoundtrips,
		parallelToolCalls: config.parallelToolCalls,
		toolChoice:
			config.toolChoice === 'required' || config.toolChoice === 'none'
				? config.toolChoice
				: 'auto',
		finalizationEnabled: config.finalizationEnabled,
		finalizationToolName: config.finalizationToolName,
		finalizationHandler:
			config.finalizationHandler === 'mark_complete_only' ||
			config.finalizationHandler === 'notify_only'
				? config.finalizationHandler
				: 'mark_complete_and_notify',
		finalizationConfig: config.finalizationConfig,
		requireFinalizationToolCall: config.requireFinalizationToolCall,
		ragEnabled: config.ragEnabled,
		ragCollectionName: config.ragCollectionName,
		ragConfig: config.ragConfig
	};
}

export class ActivityDebuggerService {
	private static readonly HIGH_USAGE_TOKEN_THRESHOLD = 20_000;

	private static async getActivityRecord(activityId: string): Promise<ActivityRow> {
		const activity = await db
			.select()
			.from(schema.interactiveLearning)
			.where(eq(schema.interactiveLearning.id, activityId))
			.get();

		if (!activity) throw error(404, 'Actividad no encontrada');
		if (activity.type !== 'chat' && activity.type !== 'agent') {
			throw error(404, 'El depurador solo soporta actividades chat y agent');
		}

		return activity;
	}

	private static async getCourseRelation(activityId: string): Promise<CourseRow | null> {
		const relation = await db
			.select({
				course: schema.course
			})
			.from(schema.courseInteractiveLearning)
			.leftJoin(schema.course, eq(schema.courseInteractiveLearning.courseId, schema.course.id))
			.where(eq(schema.courseInteractiveLearning.interactiveLearningId, activityId))
			.get();

		return relation?.course ?? null;
	}

	private static async getUsageLogsForActivity(
		activityId: string,
		dateFrom?: Date | null,
		dateTo?: Date | null
	): Promise<UsageLogRow[]> {
		const conditions = [eq(schema.aiUsageLog.interactiveLearningId, activityId)];

		if (dateFrom) conditions.push(sql`${schema.aiUsageLog.createdAt} >= ${dateFrom}`);
		if (dateTo) conditions.push(sql`${schema.aiUsageLog.createdAt} <= ${dateTo}`);

		const rows = await db
			.select({
				id: schema.aiUsageLog.id,
				modelId: schema.aiUsageLog.modelId,
				userId: schema.aiUsageLog.userId,
				courseId: schema.aiUsageLog.courseId,
				interactiveLearningId: schema.aiUsageLog.interactiveLearningId,
				chatId: schema.aiUsageLog.chatId,
				operation: schema.aiUsageLog.operation,
				inputTokens: schema.aiUsageLog.inputTokens,
				outputTokens: schema.aiUsageLog.outputTokens,
				totalTokens: schema.aiUsageLog.totalTokens,
				estimatedCost: schema.aiUsageLog.estimatedCost,
				durationMs: schema.aiUsageLog.durationMs,
				success: schema.aiUsageLog.success,
				errorMessage: schema.aiUsageLog.errorMessage,
				metadata: schema.aiUsageLog.metadata,
				createdAt: schema.aiUsageLog.createdAt,
				modelName: schema.aiModel.name,
				modelDisplayName: schema.aiModel.displayName
			})
			.from(schema.aiUsageLog)
			.leftJoin(schema.aiModel, eq(schema.aiUsageLog.modelId, schema.aiModel.id))
			.where(and(...conditions))
			.orderBy(asc(schema.aiUsageLog.createdAt));

		return rows;
	}

	private static async getPromptSnapshot(
		activity: ActivityRow
	): Promise<ActivityDebuggerPromptSnapshot> {
		if (activity.type === 'chat') {
			const config = await db
				.select()
				.from(schema.interactiveLearningChat)
				.where(eq(schema.interactiveLearningChat.id, activity.id))
				.get();

			if (!config) throw error(404, 'Configuracion de chat no encontrada');

			const storedSystemPrompt = buildStoredPromptValue('System prompt almacenado', config.systemPrompt);
			const storedRole = buildStoredPromptValue('Rol almacenado', config.llmRole);
			const storedInstructions = buildStoredPromptValue(
				'Instrucciones almacenadas',
				config.llmInstructions
			);
			const storedContext = buildStoredPromptValue('Contexto almacenado', config.llmContext);

			const canDeriveCurrent = !config.ragEnabled;
			const derivedCurrentSystemPrompt = canDeriveCurrent
				? {
						label: 'Prompt efectivo actual',
						value: AIUtils.buildSystemPrompt(
							config.llmRole,
							config.llmInstructions,
							config.llmContext,
							config.systemPrompt,
							null,
							false
						),
						origin: 'derived_current' as const,
						note: 'Snapshot derivado de la configuracion actual. No representa historico por llamada.'
					}
				: {
						label: 'Prompt efectivo actual',
						value: null,
						origin: 'unavailable' as const,
						note: 'No se reconstruye automaticamente porque el RAG introduce contexto dinamico.'
					};

			return {
				storedSystemPrompt,
				storedRole,
				storedInstructions,
				storedContext,
				derivedCurrentSystemPrompt
			};
		}

		const config = await db
			.select()
			.from(schema.interactiveLearningAgent)
			.where(eq(schema.interactiveLearningAgent.id, activity.id))
			.get();

		if (!config) throw error(404, 'Configuracion agéntica no encontrada');

		const enabledTools = await DBAgentActivityUtils.getEnabledToolsForActivity(activity.id);
		const storedSystemPrompt = buildStoredPromptValue('System prompt almacenado', config.systemPrompt);
		const storedRole = buildStoredPromptValue('Rol almacenado', config.llmRole);
		const storedInstructions = buildStoredPromptValue(
			'Instrucciones almacenadas',
			config.llmInstructions
		);
		const storedContext = buildStoredPromptValue('Contexto almacenado', config.llmContext);
		const normalizedConfig = normalizeAgentConfig(config);

		const derivedCurrentSystemPrompt = !config.ragEnabled
			? {
					label: 'Prompt efectivo actual',
					value: AgentPromptBuilder.buildSystemPrompt(
						normalizedConfig,
						enabledTools,
						null,
						null
					),
					origin: 'derived_current' as const,
					note: 'Snapshot actual derivado sin memoria de sesion. No es una captura historica exacta.'
				}
			: {
					label: 'Prompt efectivo actual',
					value: null,
					origin: 'unavailable' as const,
					note: 'No se reconstruye automaticamente porque puede incluir RAG y contexto dinamico.'
				};

		return {
			storedSystemPrompt,
			storedRole,
			storedInstructions,
			storedContext,
			derivedCurrentSystemPrompt
		};
	}

	private static async getActivityConfig(activity: ActivityRow) {
		if (activity.type === 'chat') {
			return db
				.select()
				.from(schema.interactiveLearningChat)
				.where(eq(schema.interactiveLearningChat.id, activity.id))
				.get();
		}

		return db
			.select()
			.from(schema.interactiveLearningAgent)
			.where(eq(schema.interactiveLearningAgent.id, activity.id))
			.get();
	}

	private static buildChatSessionStatus(
		messages: ChatMessageRow[],
		hasUsageErrors: boolean
	): { status: ActivityDebuggerSessionStatus; isFinalized: boolean; alerts: string[] } {
		const hasDoneMarker = messages.some((message) => message.content.includes('[[DONE]]'));
		const alerts: string[] = [];
		if (hasUsageErrors) alerts.push('Errores de uso IA');
		if (!hasDoneMarker) alerts.push('Sin marcador de finalizacion');

		return {
			status: hasUsageErrors ? 'attention' : hasDoneMarker ? 'completed' : 'pending',
			isFinalized: hasDoneMarker,
			alerts
		};
	}

	private static matchesSessionFilters(
		session: ActivityDebuggerSessionSummary,
		filters: ActivityDebuggerSessionFilters
	): boolean {
		if (filters.status && filters.status !== 'all' && session.status !== filters.status) return false;
		if (filters.onlyErrors && !session.hasUsageErrors) return false;
		if (filters.onlyToolFailures && !session.hasToolFailures) return false;
		if (filters.onlyHighUsage && session.totalTokens < this.HIGH_USAGE_TOKEN_THRESHOLD) return false;
		return true;
	}

	private static async getChatSessionSummaries(
		access: AccessContext,
		activity: ActivityRow,
		filters: ActivityDebuggerSessionFilters = {}
	): Promise<ActivityDebuggerSessionSummary[]> {
		const transcripts = await LearningEvidenceService.getActivityTranscripts(access, {
			activityId: activity.id,
			search: filters.search,
			dateFrom: filters.dateFrom ?? undefined,
			dateTo: filters.dateTo ?? undefined
		});
		if (transcripts.length === 0) return [];

		const chatIds = transcripts.map((session) => session.chatId);
		const chatInstances = await Promise.all(
			chatIds.map(async (chatId) => ({
				chatId,
				instance: await DBChatUtils.loadChatInstanceFromChatId(chatId)
			}))
		);
		const usageLogs = await this.getUsageLogsForActivity(
			activity.id,
			safeDateFromFilter(filters.dateFrom),
			safeDateFromFilter(filters.dateTo, true)
		);
		const usageByChatId = new Map<string, UsageLogRow[]>();
		for (const log of usageLogs) {
			if (!log.chatId) continue;
			const bucket = usageByChatId.get(log.chatId) ?? [];
			bucket.push(log);
			usageByChatId.set(log.chatId, bucket);
		}

		return transcripts
			.map((session) => {
				const chatInstance = chatInstances.find((entry) => entry.chatId === session.chatId)?.instance;
				const rawMessages = chatInstance?.messages ?? [];
				const usage = summarizeUsage(usageByChatId.get(session.chatId) ?? []);
				const statusInfo = this.buildChatSessionStatus(rawMessages, usage.failureCount > 0);
				const alerts = [...statusInfo.alerts];
				if (usage.totalTokens >= this.HIGH_USAGE_TOKEN_THRESHOLD) alerts.push('Uso alto de tokens');

				return {
					chatId: session.chatId,
					userId: session.student.userId,
					username: session.student.username,
					email: session.student.email,
					alias: session.student.alias,
					image: chatInstance?.user.image ?? null,
					startedAt: session.sessionStartedAt,
					lastActivityAt: session.sessionUpdatedAt,
					status: statusInfo.status,
					isFinalized: statusInfo.isFinalized,
					hasUsageErrors: usage.failureCount > 0,
					hasToolFailures: false,
					totalMessages: session.messageCount,
					learnerMessageCount: session.learnerMessageCount,
					assistantMessageCount: session.assistantMessageCount,
					toolCallCount: 0,
					uiResponseCount: 0,
					totalTokens: usage.totalTokens,
					totalInputTokens: usage.totalInputTokens,
					totalOutputTokens: usage.totalOutputTokens,
					totalEstimatedCost: usage.totalEstimatedCost,
					lastModelName: usage.lastModelName,
					alerts
				} satisfies ActivityDebuggerSessionSummary;
			})
			.filter((session) => this.matchesSessionFilters(session, filters))
			.sort((left, right) => {
				if (statusRank(left.status) !== statusRank(right.status)) {
					return statusRank(left.status) - statusRank(right.status);
				}

				return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
			});
	}

	private static async getAgentSessionSummaries(
		access: AccessContext,
		activity: ActivityRow,
		filters: ActivityDebuggerSessionFilters = {}
	): Promise<ActivityDebuggerSessionSummary[]> {
		const transcripts = await LearningEvidenceService.getActivityTranscripts(access, {
			activityId: activity.id,
			search: filters.search,
			dateFrom: filters.dateFrom ?? undefined,
			dateTo: filters.dateTo ?? undefined
		});
		if (transcripts.length === 0) return [];

		const chatIds = transcripts.map((session) => session.chatId);
		const sessionRows = await db
			.select({
				chatId: schema.userInteractiveLearningChat.chatId,
				userId: schema.user.id,
				username: schema.user.username,
				email: schema.user.email,
				alias: schema.user.alias,
				image: schema.user.image,
				chatCreatedAt: schema.chat.createdAt,
				chatUpdatedAt: schema.chat.updatedAt,
				chatMetadata: schema.chat.metadata
			})
			.from(schema.userInteractiveLearningChat)
			.innerJoin(schema.user, eq(schema.userInteractiveLearningChat.userId, schema.user.id))
			.innerJoin(schema.chat, eq(schema.userInteractiveLearningChat.chatId, schema.chat.id))
			.where(
				and(
					eq(schema.userInteractiveLearningChat.interactiveLearningChatId, activity.id),
					inArray(schema.userInteractiveLearningChat.chatId, chatIds)
				)
			);
		const messages = await db
			.select()
			.from(schema.agentMessage)
			.where(inArray(schema.agentMessage.chatId, chatIds))
			.orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));
		const assistantIds = messages.filter((message) => message.role === 'assistant').map((message) => message.id);
		const toolCalls =
			assistantIds.length > 0
				? await db
						.select({
							id: schema.agentToolCall.id,
							messageId: schema.agentToolCall.messageId,
							status: schema.agentToolCall.status,
							result: schema.agentToolCall.result
						})
						.from(schema.agentToolCall)
						.where(inArray(schema.agentToolCall.messageId, assistantIds))
				: [];
		const uiInstances =
			assistantIds.length > 0
				? await db
						.select({
							id: schema.agentUIInstance.id,
							messageId: schema.agentUIInstance.messageId,
							componentKey: schema.agentUIComponent.componentKey,
							userResponse: schema.agentUIInstance.userResponse
						})
						.from(schema.agentUIInstance)
						.innerJoin(
							schema.agentUIComponent,
							eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
						)
						.where(inArray(schema.agentUIInstance.messageId, assistantIds))
				: [];

		const sessionAnalytics = AgentSessionAnalyticsService.summarizeSessions({
			chats: sessionRows.map((row) => ({
				id: row.chatId,
				metadata: row.chatMetadata,
				createdAt: row.chatCreatedAt,
				updatedAt: row.chatUpdatedAt
			})),
			messages,
			toolCalls,
			uiInstances
		});
		const usageLogs = await this.getUsageLogsForActivity(
			activity.id,
			safeDateFromFilter(filters.dateFrom),
			safeDateFromFilter(filters.dateTo, true)
		);
		const usageByChatId = new Map<string, UsageLogRow[]>();
		for (const log of usageLogs) {
			if (!log.chatId) continue;
			const bucket = usageByChatId.get(log.chatId) ?? [];
			bucket.push(log);
			usageByChatId.set(log.chatId, bucket);
		}

		const sessions: ActivityDebuggerSessionSummary[] = [];
		for (const row of sessionRows) {
			const transcript = transcripts.find((session) => session.chatId === row.chatId);
			const analytics = sessionAnalytics.get(row.chatId);
			if (!transcript || !analytics) continue;

			const usage = summarizeUsage(usageByChatId.get(row.chatId) ?? []);
			const alerts: string[] = [];
			if (usage.failureCount > 0) alerts.push('Errores de uso IA');
			if (analytics.stats.failedToolCalls > 0) alerts.push('Tool calls fallidas');
			if (analytics.stats.pendingToolCalls > 0) alerts.push('Tool calls pendientes');
			if (!analytics.finalization) alerts.push('Sin finalizacion');
			if (usage.totalTokens >= this.HIGH_USAGE_TOKEN_THRESHOLD) alerts.push('Uso alto de tokens');

			sessions.push({
				chatId: row.chatId,
				userId: row.userId,
				username: row.username || row.email || 'Sin nombre',
				email: row.email,
				alias: row.alias ?? undefined,
				image: row.image ?? null,
				startedAt: transcript.sessionStartedAt,
				lastActivityAt: transcript.sessionUpdatedAt,
				status: analytics.status,
				isFinalized: !!analytics.finalization,
				hasUsageErrors: usage.failureCount > 0,
				hasToolFailures: analytics.stats.failedToolCalls > 0,
				totalMessages: analytics.stats.totalMessages,
				learnerMessageCount: analytics.stats.userMessages,
				assistantMessageCount: analytics.stats.assistantMessages,
				toolCallCount: analytics.stats.totalToolCalls,
				uiResponseCount: analytics.stats.respondedUiComponents,
				totalTokens: usage.totalTokens,
				totalInputTokens: usage.totalInputTokens,
				totalOutputTokens: usage.totalOutputTokens,
				totalEstimatedCost: usage.totalEstimatedCost,
				lastModelName: usage.lastModelName,
				alerts
			});
		}

		return sessions
			.filter((session) => this.matchesSessionFilters(session, filters))
			.sort((left, right) => {
				if (statusRank(left.status) !== statusRank(right.status)) {
					return statusRank(left.status) - statusRank(right.status);
				}

				return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
			});
	}

	private static async getSessionSummaries(
		access: AccessContext,
		activity: ActivityRow,
		filters: ActivityDebuggerSessionFilters = {}
	) {
		return activity.type === 'chat'
			? this.getChatSessionSummaries(access, activity, filters)
			: this.getAgentSessionSummaries(access, activity, filters);
	}

	static async getExplorerData(access: AccessContext, filters: ActivityDebuggerFilters = {}) {
		const activities = await db
			.select({
				activity: schema.interactiveLearning,
				courseId: schema.course.id,
				courseName: schema.course.name,
				courseStatus: schema.course.status
			})
			.from(schema.interactiveLearning)
			.leftJoin(
				schema.courseInteractiveLearning,
				eq(schema.courseInteractiveLearning.interactiveLearningId, schema.interactiveLearning.id)
			)
			.leftJoin(schema.course, eq(schema.courseInteractiveLearning.courseId, schema.course.id))
			.where(
				and(
					or(
						eq(schema.interactiveLearning.type, 'chat'),
						eq(schema.interactiveLearning.type, 'agent')
					)!,
					filters.courseId
						? eq(schema.courseInteractiveLearning.courseId, filters.courseId)
						: undefined,
					filters.type && filters.type !== 'all'
						? eq(schema.interactiveLearning.type, filters.type)
						: undefined
				)
			)
			.orderBy(asc(schema.course.name), asc(schema.interactiveLearning.name));

		const uniqueCourses = new Map<string, ActivityDebuggerCourseOption>();
		for (const row of activities) {
			const key = row.courseId ?? '__system__';
			const existing = uniqueCourses.get(key);
			if (existing) {
				existing.activityCount += 1;
				continue;
			}

			uniqueCourses.set(key, {
				id: row.courseId ?? null,
				name: row.courseName ?? 'Sistema / Sin curso',
				status: row.courseStatus ?? null,
				activityCount: 1
			});
		}

		const dateFrom = safeDateFromFilter(filters.dateFrom);
		const dateTo = safeDateFromFilter(filters.dateTo, true);
		const summaries = await Promise.all(
			activities.map(async (row) => {
				const sessionSummaries = await this.getSessionSummaries(access, row.activity);
				const usage = summarizeUsage(
					await this.getUsageLogsForActivity(row.activity.id, dateFrom, dateTo)
				);
				const config = await this.getActivityConfig(row.activity);
				const filteredSessions = sessionSummaries.filter((session) => {
					if (dateFrom && new Date(session.lastActivityAt) < dateFrom) return false;
					if (dateTo && new Date(session.lastActivityAt) > dateTo) return false;
					return true;
				});
				const failedToolCallCount = filteredSessions.filter((session) => session.hasToolFailures).length;
				const pendingSessionCount = filteredSessions.filter(
					(session) => session.status !== 'completed'
				).length;

				return {
					activityId: row.activity.id,
					activityName: row.activity.name,
					activityType: row.activity.type as 'chat' | 'agent',
					activityStatus: row.activity.status,
					courseId: row.courseId ?? null,
					courseName: row.courseName ?? null,
					courseStatus: row.courseStatus ?? null,
					modelName: config?.llmModel ?? usage.lastModelName ?? null,
					ragEnabled: config?.ragEnabled ?? false,
					sessionCount: filteredSessions.length,
					totalMessages: filteredSessions.reduce((sum, session) => sum + session.totalMessages, 0),
					totalTokens: usage.totalTokens,
					totalInputTokens: usage.totalInputTokens,
					totalOutputTokens: usage.totalOutputTokens,
					totalEstimatedCost: usage.totalEstimatedCost,
					lastActivityAt:
						filteredSessions
							.map((session) => session.lastActivityAt)
							.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ??
						null,
					hasFailures: filteredSessions.some((session) => session.hasUsageErrors),
					hasToolFailures: filteredSessions.some((session) => session.hasToolFailures),
					hasPendingSessions: pendingSessionCount > 0,
					pendingSessionCount,
					failedUsageCount: usage.failureCount,
					failedToolCallCount,
					highUsage: usage.totalTokens >= this.HIGH_USAGE_TOKEN_THRESHOLD
				} satisfies ActivityDebuggerActivitySummary;
			})
		);

		const filtered = summaries.filter((summary) => {
			if (
				!matchesSearch(
					[
						summary.activityName,
						summary.courseName,
						summary.modelName,
						summary.activityType,
						summary.activityStatus
					],
					filters.search
				)
			) {
				return false;
			}

			if (filters.onlyErrors && !summary.hasFailures) return false;
			if (filters.onlyToolFailures && !summary.hasToolFailures) return false;
			if (filters.onlyHighUsage && !summary.highUsage) return false;
			if (filters.onlyPendingSessions && !summary.hasPendingSessions) return false;
			if (filters.dateFrom && (!summary.lastActivityAt || new Date(summary.lastActivityAt) < dateFrom!)) {
				return false;
			}
			if (filters.dateTo && (!summary.lastActivityAt || new Date(summary.lastActivityAt) > dateTo!)) {
				return false;
			}

			return true;
		});

		return {
			activities: filtered.sort((left, right) => {
				const leftTime = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0;
				const rightTime = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0;
				return rightTime - leftTime;
			}),
			courses: Array.from(uniqueCourses.values()).sort((left, right) =>
				left.name.localeCompare(right.name)
			)
		};
	}

	static async getActivityDetail(
		access: AccessContext,
		activityId: string,
		filters: ActivityDebuggerSessionFilters = {}
	): Promise<ActivityDebuggerActivityDetail> {
		const activity = await this.getActivityRecord(activityId);
		const [course, config, prompts, usageLogs, sessions] = await Promise.all([
			this.getCourseRelation(activityId),
			this.getActivityConfig(activity),
			this.getPromptSnapshot(activity),
			this.getUsageLogsForActivity(
				activityId,
				safeDateFromFilter(filters.dateFrom),
				safeDateFromFilter(filters.dateTo, true)
			),
			this.getSessionSummaries(access, activity, filters)
		]);

		if (!config) throw error(404, 'Configuracion de actividad no encontrada');

		const tools =
			activity.type === 'agent'
				? (await DBAgentActivityUtils.getEnabledToolsForActivity(activity.id)).map((tool) => ({
						id: tool.id,
						name: tool.name,
						displayName: tool.displayName,
						category: tool.category,
						riskLevel: tool.riskLevel,
						requiresConfirmation: tool.requiresConfirmation
					}))
				: [];

		const rawSections: ActivityDebuggerRawSection[] = [
			{
				id: 'activity',
				label: 'interactive_learning',
				data: activity
			},
			{
				id: 'config',
				label: activity.type === 'chat' ? 'interactive_learning_chat' : 'interactive_learning_agent',
				data: config
			},
			{
				id: 'course',
				label: 'course',
				data: course
			},
			{
				id: 'usage',
				label: 'ai_usage_log',
				data: usageLogs
			}
		];

		return {
			activityId: activity.id,
			activityName: activity.name,
			activityType: activity.type as 'chat' | 'agent',
			activityStatus: activity.status,
			description: activity.description,
			courseId: course?.id ?? null,
			courseName: course?.name ?? null,
			courseStatus: course?.status ?? null,
			modelName: config.llmModel ?? summarizeUsage(usageLogs).lastModelName,
			ragEnabled: config.ragEnabled ?? false,
			temperature: config.temperature ?? null,
			topP: config.topP ?? null,
			maxTokens: config.maxTokens ?? null,
			systemPrompt: config.systemPrompt ?? null,
			llmRole: config.llmRole ?? null,
			llmInstructions: config.llmInstructions ?? null,
			llmContext: config.llmContext ?? null,
			metadata: parseJsonValue(config.metadata),
			ragConfig: parseJsonValue(config.ragConfig),
			tools,
			uiComponents: [],
			prompts,
			usage: summarizeUsage(usageLogs),
			sessions,
			rawSections
		};
	}

	private static async assertSessionBelongsToActivity(activityId: string, chatId: string) {
		const relation = await db
			.select()
			.from(schema.userInteractiveLearningChat)
			.where(
				and(
					eq(schema.userInteractiveLearningChat.interactiveLearningChatId, activityId),
					eq(schema.userInteractiveLearningChat.chatId, chatId)
				)
			)
			.get();

		if (!relation) throw error(404, 'Sesion no encontrada para esta actividad');
		return relation;
	}

	private static buildUsageTimelineEvents(logs: UsageLogRow[]): ActivityDebuggerTimelineEvent[] {
		return logs.map((log) => ({
			id: `usage-${log.id}`,
			kind: 'usage',
			source: 'ai_usage_log',
			timestamp: toIsoString(log.createdAt) ?? new Date().toISOString(),
			title: log.success ? 'Llamada IA completada' : 'Llamada IA con error',
			summary: `${log.modelDisplayName ?? log.modelName ?? 'Modelo desconocido'} · ${log.inputTokens} in / ${log.outputTokens} out · ${(log.estimatedCost ?? 0).toFixed(6)} USD`,
			status: log.success ? 'success' : 'error',
			raw: log,
			metrics: {
				inputTokens: log.inputTokens,
				outputTokens: log.outputTokens,
				totalTokens: log.totalTokens,
				estimatedCost: log.estimatedCost ?? 0,
				durationMs: log.durationMs ?? null,
				metadata: parseJsonValue(log.metadata)
			},
			relatedIds: {
				chatId: log.chatId,
				modelId: log.modelId
			}
		}));
	}

	private static async buildChatSessionDetail(
		access: AccessContext,
		activity: ActivityRow,
		chatId: string
	): Promise<ActivityDebuggerSessionDetail> {
		await this.assertSessionBelongsToActivity(activity.id, chatId);
		const activityDetail = await this.getActivityDetail(access, activity.id);
		const chatInstance = await DBChatUtils.loadChatInstanceFromChatId(chatId);
		const usageLogs = (await this.getUsageLogsForActivity(activity.id)).filter((log) => log.chatId === chatId);
		const sessionSummary =
			activityDetail.sessions.find((session) => session.chatId === chatId) ??
			(await this.getChatSessionSummaries(access, activity)).find((session) => session.chatId === chatId);
		if (!sessionSummary) throw error(404, 'Resumen de sesion no encontrado');

		const timeline: ActivityDebuggerTimelineEvent[] = [
			{
				id: `session-start-${chatId}`,
				kind: 'session_marker',
				source: 'chat',
				timestamp: toIsoString(chatInstance.chat.createdAt) ?? new Date().toISOString(),
				title: 'Sesion creada',
				summary: `Chat ${chatId} iniciado por ${chatInstance.user.username || chatInstance.user.email}`,
				raw: chatInstance.chat,
				relatedIds: { chatId }
			},
			{
				id: `config-${activity.id}`,
				kind: 'config_snapshot',
				source: 'interactive_learning_chat',
				timestamp: toIsoString(chatInstance.chat.createdAt) ?? new Date().toISOString(),
				title: 'Configuracion activa',
				summary: summarizeText(activityDetail.systemPrompt || activityDetail.llmInstructions || activityDetail.llmRole),
				raw: {
					systemPrompt: activityDetail.systemPrompt,
					llmRole: activityDetail.llmRole,
					llmInstructions: activityDetail.llmInstructions,
					llmContext: activityDetail.llmContext,
					ragEnabled: activityDetail.ragEnabled,
					ragConfig: activityDetail.ragConfig
				}
			},
			...chatInstance.messages
				.slice()
				.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
				.map((message) => ({
					id: `message-${message.id}`,
					kind: 'message' as const,
					source: 'message',
					timestamp: toIsoString(message.createdAt) ?? new Date().toISOString(),
					title: `Mensaje ${message.type}`,
					summary: summarizeText(message.content),
					role: message.type,
					raw: message,
					metrics: {
						tokenCount: message.tokenCount,
						finishReason: message.finishReason,
						metadata: parseJsonValue(message.metadata)
					},
					relatedIds: {
						chatId: message.chatId,
						messageId: message.id
					}
				})),
			...this.buildUsageTimelineEvents(usageLogs)
		];

		if (sessionSummary.isFinalized) {
			timeline.push({
				id: `session-finished-${chatId}`,
				kind: 'session_marker',
				source: 'message',
				timestamp: sessionSummary.lastActivityAt,
				title: 'Sesion marcada como finalizada',
				summary: 'Se detecto el marcador [[DONE]] en la conversacion.',
				raw: { doneMarker: true },
				status: 'completed',
				relatedIds: { chatId }
			});
		}

		const sortedTimeline = timeline.sort(
			(left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
		);

		return {
			activity: activityDetail,
			session: sessionSummary,
			student: {
				userId: chatInstance.user.id,
				username: chatInstance.user.username || chatInstance.user.email || 'Sin nombre',
				email: chatInstance.user.email,
				alias: chatInstance.user.alias ?? undefined,
				image: chatInstance.user.image ?? null
			},
			chat: {
				id: chatInstance.chat.id,
				title: chatInstance.chat.title,
				createdAt: toIsoString(chatInstance.chat.createdAt) ?? new Date().toISOString(),
				updatedAt: toIsoString(chatInstance.chat.updatedAt) ?? new Date().toISOString(),
				metadata: parseJsonValue(chatInstance.chat.metadata)
			},
			prompts: activityDetail.prompts,
			usage: {
				...summarizeUsage(usageLogs),
				logs: usageLogs.map((log) => ({
					id: log.id,
					createdAt: toIsoString(log.createdAt) ?? new Date().toISOString(),
					modelName: log.modelDisplayName ?? log.modelName,
					inputTokens: log.inputTokens,
					outputTokens: log.outputTokens,
					totalTokens: log.totalTokens,
					estimatedCost: log.estimatedCost ?? 0,
					durationMs: log.durationMs ?? null,
					success: log.success,
					errorMessage: log.errorMessage ?? null,
					metadata: parseJsonValue(log.metadata)
				}))
			},
			timeline: sortedTimeline,
			rawSections: [
				...activityDetail.rawSections,
				{ id: 'chat', label: 'chat', data: chatInstance.chat },
				{ id: 'messages', label: 'message', data: chatInstance.messages },
				{
					id: 'chat-metadata',
					label: 'chat.metadata',
					data: parseJsonValue(chatInstance.chat.metadata)
				}
			]
		};
	}

	private static async buildAgentSessionDetail(
		access: AccessContext,
		activity: ActivityRow,
		chatId: string
	): Promise<ActivityDebuggerSessionDetail> {
		await this.assertSessionBelongsToActivity(activity.id, chatId);
		const activityDetail = await this.getActivityDetail(access, activity.id);
		const sessionSummary =
			activityDetail.sessions.find((session) => session.chatId === chatId) ??
			(await this.getAgentSessionSummaries(access, activity)).find((session) => session.chatId === chatId);
		if (!sessionSummary) throw error(404, 'Resumen de sesion no encontrado');

		const relation = await db
			.select({
				chat: schema.chat,
				user: schema.user
			})
			.from(schema.userInteractiveLearningChat)
			.innerJoin(schema.chat, eq(schema.userInteractiveLearningChat.chatId, schema.chat.id))
			.innerJoin(schema.user, eq(schema.userInteractiveLearningChat.userId, schema.user.id))
			.where(
				and(
					eq(schema.userInteractiveLearningChat.interactiveLearningChatId, activity.id),
					eq(schema.userInteractiveLearningChat.chatId, chatId)
				)
			)
			.get();
		if (!relation) throw error(404, 'Sesion no encontrada');

		const messages = await db
			.select()
			.from(schema.agentMessage)
			.where(eq(schema.agentMessage.chatId, chatId))
			.orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));
		const messageIds = messages.map((message) => message.id);
		const toolCalls =
			messageIds.length > 0
				? await db
						.select({
							id: schema.agentToolCall.id,
							messageId: schema.agentToolCall.messageId,
							toolName: schema.agentToolCall.toolName,
							toolDefinitionId: schema.agentToolCall.toolDefinitionId,
							arguments: schema.agentToolCall.arguments,
							result: schema.agentToolCall.result,
							status: schema.agentToolCall.status,
							confirmedBy: schema.agentToolCall.confirmedBy,
							confirmedAt: schema.agentToolCall.confirmedAt,
							rejectionReason: schema.agentToolCall.rejectionReason,
							durationMs: schema.agentToolCall.durationMs,
							errorMessage: schema.agentToolCall.errorMessage,
							createdAt: schema.agentToolCall.createdAt,
							displayName: schema.agentToolDefinition.displayName
						})
						.from(schema.agentToolCall)
						.leftJoin(
							schema.agentToolDefinition,
							eq(schema.agentToolCall.toolDefinitionId, schema.agentToolDefinition.id)
						)
						.where(inArray(schema.agentToolCall.messageId, messageIds))
						.orderBy(asc(schema.agentToolCall.createdAt))
				: [];
		const uiInstances =
			messageIds.length > 0
				? await db
						.select({
							id: schema.agentUIInstance.id,
							messageId: schema.agentUIInstance.messageId,
							props: schema.agentUIInstance.props,
							state: schema.agentUIInstance.state,
							userResponse: schema.agentUIInstance.userResponse,
							respondedAt: schema.agentUIInstance.respondedAt,
							score: schema.agentUIInstance.score,
							evaluationData: schema.agentUIInstance.evaluationData,
							metadata: schema.agentUIInstance.metadata,
							createdAt: schema.agentUIInstance.createdAt,
							componentKey: schema.agentUIComponent.componentKey
						})
						.from(schema.agentUIInstance)
						.innerJoin(
							schema.agentUIComponent,
							eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
						)
						.where(inArray(schema.agentUIInstance.messageId, messageIds))
						.orderBy(asc(schema.agentUIInstance.createdAt))
				: [];
		const usageLogs = (await this.getUsageLogsForActivity(activity.id)).filter((log) => log.chatId === chatId);

		const toolCallsByMessageId = new Map<string, typeof toolCalls>();
		for (const toolCall of toolCalls) {
			const bucket = toolCallsByMessageId.get(toolCall.messageId) ?? [];
			bucket.push(toolCall);
			toolCallsByMessageId.set(toolCall.messageId, bucket);
		}
		const uiByMessageId = new Map<string, typeof uiInstances>();
		for (const ui of uiInstances) {
			const bucket = uiByMessageId.get(ui.messageId) ?? [];
			bucket.push(ui);
			uiByMessageId.set(ui.messageId, bucket);
		}

		const timeline: ActivityDebuggerTimelineEvent[] = [
			{
				id: `session-start-${chatId}`,
				kind: 'session_marker',
				source: 'chat',
				timestamp: toIsoString(relation.chat.createdAt) ?? new Date().toISOString(),
				title: 'Sesion creada',
				summary: `Chat ${chatId} iniciado por ${relation.user.username || relation.user.email}`,
				raw: relation.chat,
				relatedIds: { chatId }
			},
			{
				id: `config-${activity.id}`,
				kind: 'config_snapshot',
				source: 'interactive_learning_agent',
				timestamp: toIsoString(relation.chat.createdAt) ?? new Date().toISOString(),
				title: 'Configuracion agéntica actual',
				summary: summarizeText(activityDetail.systemPrompt || activityDetail.llmInstructions || activityDetail.llmRole),
				raw: {
					systemPrompt: activityDetail.systemPrompt,
					llmRole: activityDetail.llmRole,
					llmInstructions: activityDetail.llmInstructions,
					llmContext: activityDetail.llmContext,
					ragEnabled: activityDetail.ragEnabled,
					ragConfig: activityDetail.ragConfig,
					tools: activityDetail.tools
				}
			}
		];

		for (const message of messages) {
			timeline.push({
				id: `message-${message.id}`,
				kind: 'message',
				source: 'agent_message',
				timestamp: toIsoString(message.createdAt) ?? new Date().toISOString(),
				title: `Mensaje ${message.role}`,
				summary: summarizeText(message.textContent),
				role: message.role,
				raw: message,
				metrics: {
					tokenCount: message.tokenCount,
					finishReason: message.finishReason,
					metadata: parseJsonValue(message.metadata),
					sequenceOrder: message.sequenceOrder
				},
				relatedIds: {
					chatId: message.chatId,
					messageId: message.id,
					toolCallId: message.toolCallId ?? null
				}
			});

			for (const toolCall of toolCallsByMessageId.get(message.id) ?? []) {
				timeline.push({
					id: `tool-call-${toolCall.id}`,
					kind: 'tool_call',
					source: 'agent_tool_call',
					timestamp: toIsoString(toolCall.createdAt) ?? new Date().toISOString(),
					title: `Tool call ${toolCall.displayName ?? toolCall.toolName}`,
					summary: summarizeText(JSON.stringify(parseJsonValue(toolCall.arguments))),
					status: toolCall.status,
					raw: toolCall,
					metrics: {
						durationMs: toolCall.durationMs ?? null,
						errorMessage: toolCall.errorMessage ?? null,
						arguments: parseJsonValue(toolCall.arguments)
					},
					relatedIds: {
						chatId,
						messageId: toolCall.messageId,
						toolCallId: toolCall.id
					}
				});

				if (toolCall.result || toolCall.errorMessage) {
					timeline.push({
						id: `tool-result-${toolCall.id}`,
						kind: 'tool_result',
						source: 'agent_tool_call',
						timestamp: toIsoString(toolCall.createdAt) ?? new Date().toISOString(),
						title: `Resultado ${toolCall.displayName ?? toolCall.toolName}`,
						summary: summarizeText(JSON.stringify(parseJsonValue(toolCall.result))),
						status: toolCall.status,
						raw: {
							result: parseJsonValue(toolCall.result),
							errorMessage: toolCall.errorMessage
						},
						metrics: {
							durationMs: toolCall.durationMs ?? null,
							errorMessage: toolCall.errorMessage ?? null
						},
						relatedIds: {
							chatId,
							messageId: toolCall.messageId,
							toolCallId: toolCall.id
						}
					});
				}
			}

			for (const ui of uiByMessageId.get(message.id) ?? []) {
				timeline.push({
					id: `ui-component-${ui.id}`,
					kind: 'ui_component',
					source: 'agent_ui_instance',
					timestamp: toIsoString(ui.createdAt) ?? new Date().toISOString(),
					title: `UI ${ui.componentKey}`,
					summary: summarizeText(JSON.stringify(parseJsonValue(ui.props))),
					raw: ui,
					metrics: {
						props: parseJsonValue(ui.props),
						state: parseJsonValue(ui.state),
						metadata: parseJsonValue(ui.metadata)
					},
					relatedIds: {
						chatId,
						messageId: ui.messageId,
						uiInstanceId: ui.id
					}
				});

				if (ui.userResponse) {
					timeline.push({
						id: `ui-response-${ui.id}`,
						kind: 'ui_response',
						source: 'agent_ui_instance',
						timestamp:
							toIsoString(ui.respondedAt) ??
							toIsoString(ui.createdAt) ??
							new Date().toISOString(),
						title: `Respuesta UI ${ui.componentKey}`,
						summary: summarizeText(JSON.stringify(parseJsonValue(ui.userResponse))),
						raw: ui,
						metrics: {
							userResponse: parseJsonValue(ui.userResponse),
							score: ui.score ?? null,
							evaluationData: parseJsonValue(ui.evaluationData)
						},
						relatedIds: {
							chatId,
							messageId: ui.messageId,
							uiInstanceId: ui.id
						}
					});
				}
			}
		}

		timeline.push(...this.buildUsageTimelineEvents(usageLogs));

		const finalization = parseJsonRecord(relation.chat.metadata)?.agentFinalization;
		if (finalization) {
			timeline.push({
				id: `session-finalization-${chatId}`,
				kind: 'session_marker',
				source: 'chat.metadata',
				timestamp: sessionSummary.lastActivityAt,
				title: 'Finalizacion registrada',
				summary: summarizeText(JSON.stringify(finalization)),
				status: 'completed',
				raw: finalization,
				relatedIds: { chatId }
			});
		}

		const sortedTimeline = timeline.sort((left, right) => {
			const timeDiff = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
			if (timeDiff !== 0) return timeDiff;
			return left.id.localeCompare(right.id);
		});

		return {
			activity: activityDetail,
			session: sessionSummary,
			student: {
				userId: relation.user.id,
				username: relation.user.username || relation.user.email || 'Sin nombre',
				email: relation.user.email,
				alias: relation.user.alias ?? undefined,
				image: relation.user.image ?? null
			},
			chat: {
				id: relation.chat.id,
				title: relation.chat.title,
				createdAt: toIsoString(relation.chat.createdAt) ?? new Date().toISOString(),
				updatedAt: toIsoString(relation.chat.updatedAt) ?? new Date().toISOString(),
				metadata: parseJsonValue(relation.chat.metadata)
			},
			prompts: activityDetail.prompts,
			usage: {
				...summarizeUsage(usageLogs),
				logs: usageLogs.map((log) => ({
					id: log.id,
					createdAt: toIsoString(log.createdAt) ?? new Date().toISOString(),
					modelName: log.modelDisplayName ?? log.modelName,
					inputTokens: log.inputTokens,
					outputTokens: log.outputTokens,
					totalTokens: log.totalTokens,
					estimatedCost: log.estimatedCost ?? 0,
					durationMs: log.durationMs ?? null,
					success: log.success,
					errorMessage: log.errorMessage ?? null,
					metadata: parseJsonValue(log.metadata)
				}))
			},
			timeline: sortedTimeline,
			rawSections: [
				...activityDetail.rawSections,
				{ id: 'chat', label: 'chat', data: relation.chat },
				{ id: 'agent_message', label: 'agent_message', data: messages },
				{ id: 'agent_tool_call', label: 'agent_tool_call', data: toolCalls },
				{ id: 'agent_ui_instance', label: 'agent_ui_instance', data: uiInstances },
				{
					id: 'chat-metadata',
					label: 'chat.metadata',
					data: parseJsonValue(relation.chat.metadata)
				}
			]
		};
	}

	static async getSessionDetail(
		access: AccessContext,
		activityId: string,
		chatId: string
	): Promise<ActivityDebuggerSessionDetail> {
		const activity = await this.getActivityRecord(activityId);
		return activity.type === 'chat'
			? this.buildChatSessionDetail(access, activity, chatId)
			: this.buildAgentSessionDetail(access, activity, chatId);
	}
}
