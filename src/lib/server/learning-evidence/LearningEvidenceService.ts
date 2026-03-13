import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { CourseRoleUtils, DBChatUtils, RoleUtils, db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type {
	LearningEvidenceAccessContext,
	LearningEvidenceActivityContext,
	LearningEvidenceMessagePart,
	LearningEvidenceMessageRole,
	LearningEvidenceOverview,
	LearningEvidenceRosterEntry,
	LearningEvidenceStudentRef,
	LearningEvidenceStudentSummary,
	LearningEvidenceToolCallPart,
	LearningEvidenceToolResultPart,
	LearningEvidenceTranscriptMessage,
	LearningEvidenceTranscriptQuery,
	LearningEvidenceTranscriptSession,
	LearningEvidenceUIComponentPart,
	LearningEvidenceUIResponsePart
} from '$lib/types/learningEvidence';
import { ROLE_LEVELS } from '$lib/server/roles';

type ActivityRecord = typeof schema.interactiveLearning.$inferSelect;

type EvidenceProvider = {
	getActivityContext(activity: ActivityRecord, courseId: string | null): Promise<LearningEvidenceActivityContext>;
	getTranscripts(query: LearningEvidenceTranscriptQuery): Promise<LearningEvidenceTranscriptSession[]>;
};

function toIsoString(value: Date | string | number | null | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getEarliestIso(values: Array<string | null | undefined>): string | null {
	return values.reduce<string | null>((earliest, value) => {
		if (!value) return earliest;
		if (!earliest) return value;
		return new Date(value) < new Date(earliest) ? value : earliest;
	}, null);
}

function getLatestIso(values: Array<string | null | undefined>): string | null {
	return values.reduce<string | null>((latest, value) => {
		if (!value) return latest;
		if (!latest) return value;
		return new Date(value) > new Date(latest) ? value : latest;
	}, null);
}

function normalizeChatRole(value: string): LearningEvidenceMessageRole {
	const normalized = value.trim().toLowerCase();
	if (normalized === 'system') return 'system';
	if (normalized === 'assistant') return 'assistant';
	if (normalized === 'tool') return 'tool';
	return 'user';
}

function safeJsonParse(value: string | null | undefined): Record<string, unknown> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function safeUnknownJsonParse(value: string | null | undefined): unknown {
	if (!value) return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

function buildDisplayText(parts: LearningEvidenceMessagePart[], fallback: string | null = null): string {
	const chunks: string[] = [];

	for (const part of parts) {
		if (part.kind === 'text') {
			if (part.text.trim()) chunks.push(part.text.trim());
			continue;
		}

		if (part.kind === 'tool-call') {
			chunks.push(
				`[Tool call: ${part.toolDisplayName || part.toolName}] ${JSON.stringify(part.args)}`
			);
			continue;
		}

		if (part.kind === 'tool-result') {
			const summary = part.text?.trim()
				? part.text.trim()
				: typeof part.result === 'string'
					? part.result
					: part.result
						? JSON.stringify(part.result)
						: part.errorMessage ?? '';
			chunks.push(
				`[Tool result: ${part.toolDisplayName || part.toolName}]${summary ? ` ${summary}` : ''}`
			);
			continue;
		}

		if (part.kind === 'ui-component') {
			chunks.push(`[UI component: ${part.componentKey}]`);
			continue;
		}

		if (part.kind === 'ui-response') {
			const responseSummary =
				typeof part.payload === 'string' ? part.payload : JSON.stringify(part.payload);
			chunks.push(`[UI response: ${part.componentKey}] ${responseSummary ?? ''}`.trim());
		}
	}

	if (chunks.length > 0) return chunks.join('\n');
	return fallback?.trim() ?? '';
}

function normalizeStudentRef(student: {
	userId: string;
	username: string | null;
	email: string;
	alias: string | null;
}): LearningEvidenceStudentRef {
	return {
		userId: student.userId,
		username: student.username || student.email || 'Sin nombre',
		email: student.email,
		alias: student.alias ?? undefined
	};
}

function matchesSearch(session: LearningEvidenceTranscriptSession, search: string): boolean {
	const needle = search.trim().toLowerCase();
	if (!needle) return true;

	const studentFields = [session.student.username, session.student.email, session.student.alias ?? ''];
	if (studentFields.some((value) => value.toLowerCase().includes(needle))) return true;

	return session.messages.some((message) => message.displayText.toLowerCase().includes(needle));
}

function filterSessionMessages(
	session: LearningEvidenceTranscriptSession,
	includeRoles: LearningEvidenceMessageRole[] | undefined,
	search: string | undefined
): LearningEvidenceTranscriptSession | null {
	const roles = includeRoles && includeRoles.length > 0 ? new Set(includeRoles) : null;
	const filteredMessages = session.messages.filter((message) => {
		if (roles && !roles.has(message.role)) return false;
		if (search && !message.displayText.toLowerCase().includes(search.toLowerCase())) return false;
		return true;
	});

	if (filteredMessages.length === 0 && (roles || search)) return null;

	const latestMessage = filteredMessages.at(-1);

	return {
		...session,
		messages: filteredMessages,
		messageCount: filteredMessages.length,
		learnerMessageCount: filteredMessages.filter((message) => message.role === 'user').length,
		assistantMessageCount: filteredMessages.filter((message) => message.role === 'assistant').length,
		sessionUpdatedAt: latestMessage?.createdAt ?? session.sessionUpdatedAt
	};
}

class ChatEvidenceProvider implements EvidenceProvider {
	async getActivityContext(
		activity: ActivityRecord,
		courseId: string | null
	): Promise<LearningEvidenceActivityContext> {
		const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(activity.id, {
			bypassStatusCheck: true
		});

		return {
			activityId: activity.id,
			courseId,
			activityType: activity.type,
			name: activity.name,
			description: activity.description,
			systemPrompt: interactiveChat.interactive_learning_chat.systemPrompt,
			llmRole: interactiveChat.interactive_learning_chat.llmRole,
			llmInstructions: interactiveChat.interactive_learning_chat.llmInstructions,
			llmContext: interactiveChat.interactive_learning_chat.llmContext
		};
	}

	async getTranscripts(query: LearningEvidenceTranscriptQuery): Promise<LearningEvidenceTranscriptSession[]> {
		const filterUserId = query.studentIds?.length === 1 ? query.studentIds[0] : undefined;
		const filterOptions = {
			userId: filterUserId,
			startDate: query.dateFrom ? new Date(query.dateFrom) : undefined,
			endDate: query.dateTo ? new Date(query.dateTo) : undefined,
			searchTerm: query.search
		};

		const result = await DBChatUtils.getAllChatInstancesFromInteractiveId(
			query.activityId,
			filterOptions,
			undefined,
			undefined
		);

		const studentFilter = query.studentIds ? new Set(query.studentIds) : null;
		const chatFilter = query.chatIds ? new Set(query.chatIds) : null;

		return result.chats
			.filter((chat) => (studentFilter ? studentFilter.has(chat.user.id) : true))
			.filter((chat) => (chatFilter ? chatFilter.has(chat.chat.id) : true))
			.map((chat) => {
				const sortedMessages = [...chat.messages].sort(
					(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
				);

				const messages: LearningEvidenceTranscriptMessage[] = sortedMessages.map((message) => {
					const role = normalizeChatRole(message.type);
					const parts: LearningEvidenceMessagePart[] = [
						{
							kind: 'text',
							text: message.content
						}
					];

					return {
						id: message.id,
						role,
						createdAt: new Date(message.createdAt).toISOString(),
						displayText: message.content,
						parts,
						source: 'chat_message'
					};
				});

				const latestMessage = messages.at(-1);
				return {
					student: {
						userId: chat.user.id,
						username: chat.user.username || chat.user.email || 'Sin nombre',
						email: chat.user.email,
						alias: chat.user.alias ?? undefined
					},
					chatId: chat.chat.id,
					sessionStartedAt: new Date(chat.chat.createdAt).toISOString(),
					sessionUpdatedAt:
						latestMessage?.createdAt ??
						toIsoString(chat.chat.updatedAt) ??
						new Date(chat.chat.createdAt).toISOString(),
					messageCount: messages.length,
					learnerMessageCount: messages.filter((message) => message.role === 'user').length,
					assistantMessageCount: messages.filter((message) => message.role === 'assistant').length,
					toolCallCount: 0,
					uiResponseCount: 0,
					messages
				};
			});
	}
}

class AgentEvidenceProvider implements EvidenceProvider {
	async getActivityContext(
		activity: ActivityRecord,
		courseId: string | null
	): Promise<LearningEvidenceActivityContext> {
		const agentConfig = await db
			.select()
			.from(schema.interactiveLearningAgent)
			.where(eq(schema.interactiveLearningAgent.id, activity.id))
			.get();

		if (!agentConfig) {
			throw error(404, 'Configuración agéntica no encontrada');
		}

		return {
			activityId: activity.id,
			courseId,
			activityType: activity.type,
			name: activity.name,
			description: activity.description,
			systemPrompt: agentConfig.systemPrompt,
			llmRole: agentConfig.llmRole,
			llmInstructions: agentConfig.llmInstructions,
			llmContext: agentConfig.llmContext
		};
	}

	async getTranscripts(query: LearningEvidenceTranscriptQuery): Promise<LearningEvidenceTranscriptSession[]> {
		const conditions = [eq(schema.userInteractiveLearningChat.interactiveLearningChatId, query.activityId)];

		if (query.studentIds && query.studentIds.length > 0) {
			conditions.push(inArray(schema.userInteractiveLearningChat.userId, query.studentIds));
		}

		if (query.chatIds && query.chatIds.length > 0) {
			conditions.push(inArray(schema.userInteractiveLearningChat.chatId, query.chatIds));
		}

		if (query.dateFrom) {
			const from = new Date(query.dateFrom);
			conditions.push(sql`${schema.chat.createdAt} >= ${Math.floor(from.getTime() / 1000)}`);
		}

		if (query.dateTo) {
			const to = new Date(query.dateTo);
			conditions.push(sql`${schema.chat.createdAt} <= ${Math.floor(to.getTime() / 1000)}`);
		}

		if (query.search?.trim()) {
			const searchValue = `%${query.search.trim()}%`;
			conditions.push(
				or(
					like(schema.user.username, searchValue),
					like(schema.user.email, searchValue),
					like(schema.user.alias, searchValue)
				)!
			);
		}

		const sessions = await db
			.select({
				chatId: schema.userInteractiveLearningChat.chatId,
				userId: schema.userInteractiveLearningChat.userId,
				sessionCreatedAt: schema.userInteractiveLearningChat.createdAt,
				chatCreatedAt: schema.chat.createdAt,
				chatUpdatedAt: schema.chat.updatedAt,
				username: schema.user.username,
				email: schema.user.email,
				alias: schema.user.alias
			})
			.from(schema.userInteractiveLearningChat)
			.innerJoin(schema.user, eq(schema.user.id, schema.userInteractiveLearningChat.userId))
			.innerJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
			.where(and(...conditions))
			.orderBy(desc(schema.chat.createdAt));

		if (sessions.length === 0) return [];

		const chatIds = sessions.map((session) => session.chatId);

		const rawMessages = await db
			.select()
			.from(schema.agentMessage)
			.where(inArray(schema.agentMessage.chatId, chatIds))
			.orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));

		const messageIds = rawMessages.map((message) => message.id);
		const toolCalls =
			messageIds.length > 0
				? await db
						.select({
							id: schema.agentToolCall.id,
							messageId: schema.agentToolCall.messageId,
							toolName: schema.agentToolCall.toolName,
							arguments: schema.agentToolCall.arguments,
							result: schema.agentToolCall.result,
							status: schema.agentToolCall.status,
							durationMs: schema.agentToolCall.durationMs,
							errorMessage: schema.agentToolCall.errorMessage,
							requiresConfirmation: schema.agentToolDefinition.requiresConfirmation,
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
							userResponse: schema.agentUIInstance.userResponse,
							respondedAt: schema.agentUIInstance.respondedAt,
							score: schema.agentUIInstance.score,
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

		const toolCallsByMessageId = new Map<string, typeof toolCalls>();
		const toolCallsById = new Map<string, (typeof toolCalls)[number]>();
		for (const toolCall of toolCalls) {
			const current = toolCallsByMessageId.get(toolCall.messageId) ?? [];
			current.push(toolCall);
			toolCallsByMessageId.set(toolCall.messageId, current);
			toolCallsById.set(toolCall.id, toolCall);
		}

		const uiByMessageId = new Map<string, typeof uiInstances>();
		for (const instance of uiInstances) {
			const current = uiByMessageId.get(instance.messageId) ?? [];
			current.push(instance);
			uiByMessageId.set(instance.messageId, current);
		}

		const messagesByChatId = new Map<string, LearningEvidenceTranscriptMessage[]>();
		for (const message of rawMessages) {
			const role = normalizeChatRole(message.role);
			const parts: LearningEvidenceMessagePart[] = [];
			const rawText = message.textContent ?? '';

			if (rawText.trim()) {
				parts.push({ kind: 'text', text: rawText });
			}

			for (const toolCall of toolCallsByMessageId.get(message.id) ?? []) {
				const toolPart: LearningEvidenceToolCallPart = {
					kind: 'tool-call',
					toolCallId: toolCall.id,
					toolName: toolCall.toolName,
					toolDisplayName: toolCall.displayName ?? toolCall.toolName,
					args: safeJsonParse(toolCall.arguments),
					status: toolCall.status,
					requiresConfirmation: toolCall.requiresConfirmation ?? false
				};
				parts.push(toolPart);
			}

			for (const ui of uiByMessageId.get(message.id) ?? []) {
				const uiPart: LearningEvidenceUIComponentPart = {
					kind: 'ui-component',
					instanceId: ui.id,
					componentKey: ui.componentKey,
					props: safeJsonParse(ui.props),
					interactive: true
				};
				parts.push(uiPart);

				if (ui.userResponse) {
					const responsePart: LearningEvidenceUIResponsePart = {
						kind: 'ui-response',
						instanceId: ui.id,
						componentKey: ui.componentKey,
						payload: safeUnknownJsonParse(ui.userResponse),
						respondedAt: toIsoString(ui.respondedAt),
						score: ui.score ?? null
					};
					parts.push(responsePart);
				}
			}

			if (role === 'tool') {
				const linkedToolCall = message.toolCallId ? toolCallsById.get(message.toolCallId) : null;
				const resultPart: LearningEvidenceToolResultPart = {
					kind: 'tool-result',
					toolCallId: message.toolCallId ?? null,
					toolName: linkedToolCall?.toolName ?? message.toolName ?? 'tool',
					toolDisplayName:
						linkedToolCall?.displayName ?? linkedToolCall?.toolName ?? message.toolName ?? 'tool',
					status: linkedToolCall?.status ?? null,
					result: linkedToolCall ? safeUnknownJsonParse(linkedToolCall.result) : null,
					text: rawText || null,
					errorMessage: linkedToolCall?.errorMessage ?? null,
					durationMs: linkedToolCall?.durationMs ?? null
				};

				parts.length = 0;
				parts.push(resultPart);
			}

			const transcriptMessage: LearningEvidenceTranscriptMessage = {
				id: message.id,
				role,
				createdAt: new Date(message.createdAt).toISOString(),
				displayText: buildDisplayText(parts, rawText),
				parts,
				source:
					role === 'tool'
						? 'agent_tool_call'
						: uiByMessageId.has(message.id)
							? 'agent_ui_instance'
							: 'agent_message'
			};

			const bucket = messagesByChatId.get(message.chatId) ?? [];
			bucket.push(transcriptMessage);
			messagesByChatId.set(message.chatId, bucket);
		}

		return sessions.map((session) => {
			const messages = messagesByChatId.get(session.chatId) ?? [];
			const latestMessage = messages.at(-1);
			const toolCallCount = messages.reduce(
				(sum, message) =>
					sum +
					message.parts.filter((part) => part.kind === 'tool-call' || part.kind === 'tool-result').length,
				0
			);
			const uiResponseCount = messages.reduce(
				(sum, message) => sum + message.parts.filter((part) => part.kind === 'ui-response').length,
				0
			);

			return {
				student: {
					userId: session.userId,
					username: session.username || session.email || 'Sin nombre',
					email: session.email,
					alias: session.alias ?? undefined
				},
				chatId: session.chatId,
				sessionStartedAt: new Date(session.chatCreatedAt).toISOString(),
				sessionUpdatedAt:
					latestMessage?.createdAt ??
					toIsoString(session.chatUpdatedAt) ??
					new Date(session.chatCreatedAt).toISOString(),
				messageCount: messages.length,
				learnerMessageCount: messages.filter((message) => message.role === 'user').length,
				assistantMessageCount: messages.filter((message) => message.role === 'assistant').length,
				toolCallCount,
				uiResponseCount,
				messages
			};
		});
	}
}

export class LearningEvidenceService {
	private static readonly chatProvider = new ChatEvidenceProvider();
	private static readonly agentProvider = new AgentEvidenceProvider();

	private static async resolveActorHighestRoleLevel(
		access: LearningEvidenceAccessContext
	): Promise<number> {
		if (typeof access.actorHighestRoleLevel === 'number') return access.actorHighestRoleLevel;
		const highestRole = await RoleUtils.getUserHighestRole(access.actorUserId);
		return highestRole?.level ?? 0;
	}

	private static async resolveActivity(activityId: string) {
		const activity = await db
			.select()
			.from(schema.interactiveLearning)
			.where(eq(schema.interactiveLearning.id, activityId))
			.get();

		if (!activity) {
			throw error(404, 'Actividad no encontrada');
		}

		const courseRelations = await db
			.select({ courseId: schema.courseInteractiveLearning.courseId })
			.from(schema.courseInteractiveLearning)
			.where(eq(schema.courseInteractiveLearning.interactiveLearningId, activityId));

		const courseId = courseRelations[0]?.courseId ?? null;
		return { activity, courseId };
	}

	private static getProvider(activityType: string): EvidenceProvider {
		if (activityType === 'chat') return this.chatProvider;
		if (activityType === 'agent') return this.agentProvider;
		throw error(501, `Learning Evidence no soporta actividades de tipo "${activityType}" todavía`);
	}

	private static async assertCourseEvidenceAccess(
		courseId: string,
		access: LearningEvidenceAccessContext
	) {
		const highestRoleLevel = await this.resolveActorHighestRoleLevel(access);
		if (highestRoleLevel >= ROLE_LEVELS.ADMIN) return;

		const hasPermission = await CourseRoleUtils.userHasCoursePermission(
			access.actorUserId,
			courseId,
			'viewAnalytics'
		);

		if (!hasPermission) {
			throw error(403, 'No tienes permisos para leer evidencia educativa de este curso');
		}
	}

	static async getCourseStudentRoster(
		access: LearningEvidenceAccessContext,
		courseId: string,
		studentIds?: string[]
	): Promise<LearningEvidenceRosterEntry[]> {
		await this.assertCourseEvidenceAccess(courseId, access);

		const courseUsers = await CourseRoleUtils.getCourseUsers(courseId);
		const requestedStudentIds = studentIds ? new Set(studentIds) : null;

		return courseUsers
			.filter((user) => user.role === 'student')
			.filter((user) => (requestedStudentIds ? requestedStudentIds.has(user.userId) : true))
			.map((student) => ({
				...normalizeStudentRef(student),
				role: student.role,
				level: student.level,
				isEnrolled: true
			}));
	}

	static async getActivityContext(
		access: LearningEvidenceAccessContext,
		activityId: string
	): Promise<LearningEvidenceActivityContext> {
		const { activity, courseId } = await this.resolveActivity(activityId);
		if (courseId) {
			await this.assertCourseEvidenceAccess(courseId, access);
		}

		return this.getProvider(activity.type).getActivityContext(activity, courseId);
	}

	static async getActivityTranscripts(
		access: LearningEvidenceAccessContext,
		query: LearningEvidenceTranscriptQuery
	): Promise<LearningEvidenceTranscriptSession[]> {
		const { activity, courseId } = await this.resolveActivity(query.activityId);
		if (courseId) {
			await this.assertCourseEvidenceAccess(courseId, access);
		}

		const provider = this.getProvider(activity.type);
		const rawSessions = await provider.getTranscripts(query);

		const sessionSearch = query.search?.trim();
		const filteredBySearch = rawSessions.filter((session) =>
			sessionSearch ? matchesSearch(session, sessionSearch) : true
		);

		const filteredSessions = filteredBySearch
			.map((session) => filterSessionMessages(session, query.includeRoles, undefined))
			.filter((session): session is LearningEvidenceTranscriptSession => session !== null);

		return filteredSessions;
	}

	static async getActivityEvidenceOverview(
		access: LearningEvidenceAccessContext,
		activityId: string,
		studentIds?: string[]
	): Promise<LearningEvidenceOverview> {
		const { activity, courseId } = await this.resolveActivity(activityId);
		if (courseId) {
			await this.assertCourseEvidenceAccess(courseId, access);
		}

		const provider = this.getProvider(activity.type);
		const activityContext = await provider.getActivityContext(activity, courseId);
		const roster = courseId ? await this.getCourseStudentRoster(access, courseId, studentIds) : [];
		const transcripts = await provider.getTranscripts({ activityId, studentIds });
		const transcriptsByStudent = new Map<string, LearningEvidenceTranscriptSession[]>();
		const rosterStudentIds = roster.map((student) => student.userId);
		const progressRows =
			courseId && rosterStudentIds.length > 0
				? await db
						.select()
						.from(schema.learningActivityProgress)
						.where(
							and(
								eq(schema.learningActivityProgress.courseId, courseId),
								eq(schema.learningActivityProgress.activityId, activityId),
								inArray(schema.learningActivityProgress.userId, rosterStudentIds)
							)
						)
				: [];
		const progressByStudent = new Map(progressRows.map((row) => [row.userId, row]));

		for (const transcript of transcripts) {
			const current = transcriptsByStudent.get(transcript.student.userId) ?? [];
			current.push(transcript);
			transcriptsByStudent.set(transcript.student.userId, current);
		}

		const studentSummaries: LearningEvidenceStudentSummary[] = roster.map((student) => {
			const sessions = transcriptsByStudent.get(student.userId) ?? [];
			const progress = progressByStudent.get(student.userId);
			const messages = sessions.flatMap((session) => session.messages);
			const learnerMessages = messages.filter((message) => message.role === 'user');
			const learnerTextLength = learnerMessages.reduce(
				(sum, message) => sum + message.displayText.length,
				0
			);
			const startedAt = toIsoString(progress?.startedAt);
			const completedAt = toIsoString(progress?.completedAt);
			const firstActivityAt = getEarliestIso([
				...sessions.map((session) => session.sessionStartedAt),
				startedAt
			]);
			const lastActivityAt = getLatestIso([
				...sessions.map((session) => session.sessionUpdatedAt),
				toIsoString(progress?.lastInteractionAt),
				completedAt
			]);
			const progressStatus = progress?.status ?? (sessions.length > 0 ? 'in_progress' : 'not_started');

			return {
				...student,
				progressStatus,
				sessionCount: sessions.length,
				totalMessages: messages.length,
				learnerMessageCount: learnerMessages.length,
				assistantMessageCount: messages.filter((message) => message.role === 'assistant').length,
				toolCallCount: sessions.reduce((sum, session) => sum + session.toolCallCount, 0),
				uiResponseCount: sessions.reduce((sum, session) => sum + session.uiResponseCount, 0),
				averageLearnerMessageLength:
					learnerMessages.length > 0 ? Math.round(learnerTextLength / learnerMessages.length) : 0,
				startedAt,
				firstActivityAt,
				lastActivityAt,
				completedAt,
				attemptsCount: progress?.attemptsCount ?? sessions.length,
				timeSpentSeconds: progress?.timeSpentSeconds ?? 0
			};
		});

		const activeSummaries = studentSummaries.filter(
			(summary) => summary.progressStatus !== 'not_started'
		);
		const lastActivityAt = activeSummaries.reduce<string | null>((latest, summary) => {
			if (!summary.lastActivityAt) return latest;
			if (!latest) return summary.lastActivityAt;
			return new Date(summary.lastActivityAt) > new Date(latest) ? summary.lastActivityAt : latest;
		}, null);

		return {
			activity: activityContext,
			totalEnrolledStudents: roster.length,
			studentsWithEvidenceCount: activeSummaries.length,
			totalSessions: transcripts.length,
			totalMessages: transcripts.reduce((sum, session) => sum + session.messageCount, 0),
			lastActivityAt,
			studentSummaries
		};
	}
}
