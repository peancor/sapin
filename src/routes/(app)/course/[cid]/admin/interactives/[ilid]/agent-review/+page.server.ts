import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, count, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { uiComponentRequiresResponse } from '$lib/utils/agentUI';

type SessionStatus = 'completed' | 'pending' | 'attention';

function isInternalTriggerMessage(content: string | null): boolean {
	return !!content && /^\[\[.*\]\]$/s.test(content.trim());
}

function cleanPreviewText(content: string | null | undefined): string | undefined {
	if (!content) return undefined;

	const cleaned = content.replace(/\s+/g, ' ').trim();
	return cleaned.length > 0 ? cleaned : undefined;
}

function truncateText(content: string | undefined, maxLength = 180): string | undefined {
	if (!content) return undefined;
	if (content.length <= maxLength) return content;
	return `${content.slice(0, maxLength - 1).trimEnd()}...`;
}

export const load = (async ({ params, url, locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const { cid, ilid } = params;

	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		locals.user.id,
		cid,
		ilid,
		locals.user.highestRoleLevel
	);
	if (!access.allowed) throw error(403, access.reason || 'Sin permisos');

	const interactiveRecord = await db
		.select()
		.from(schema.interactiveLearning)
		.where(eq(schema.interactiveLearning.id, ilid))
		.get();

	if (!interactiveRecord) throw error(404, 'Actividad no encontrada');
	if (interactiveRecord.type !== 'agent') {
		throw redirect(303, `/course/${cid}/admin/interactives/${ilid}/chat-review`);
	}

	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
	const pageSize = Math.max(1, parseInt(url.searchParams.get('pageSize') || '10'));
	const searchTerm = url.searchParams.get('search') || undefined;
	const sortDirection = (url.searchParams.get('sortDirection') || 'desc') as 'asc' | 'desc';
	const startDateStr = url.searchParams.get('startDate');
	const endDateStr = url.searchParams.get('endDate');
	const startDate = startDateStr ? new Date(startDateStr) : undefined;
	const endDate = endDateStr ? new Date(`${endDateStr}T23:59:59`) : undefined;

	const conditions = [
		eq(schema.userInteractiveLearningChat.interactiveLearningChatId, ilid),
		...(searchTerm ? [like(schema.user.username, `%${searchTerm}%`)] : []),
		...(startDate ? [sql`${schema.chat.createdAt} >= ${startDate.getTime() / 1000}`] : []),
		...(endDate ? [sql`${schema.chat.createdAt} <= ${endDate.getTime() / 1000}`] : [])
	];

	const [{ total }] = await db
		.select({ total: count(schema.userInteractiveLearningChat.id) })
		.from(schema.userInteractiveLearningChat)
		.innerJoin(schema.user, eq(schema.user.id, schema.userInteractiveLearningChat.userId))
		.innerJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
		.where(and(...conditions));

	const offset = (page - 1) * pageSize;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const sessions = await db
		.select({
			sessionId: schema.userInteractiveLearningChat.id,
			chatId: schema.userInteractiveLearningChat.chatId,
			userId: schema.userInteractiveLearningChat.userId,
			sessionCreatedAt: schema.userInteractiveLearningChat.createdAt,
			chatCreatedAt: schema.chat.createdAt,
			chatUpdatedAt: schema.chat.updatedAt,
			username: schema.user.username,
			email: schema.user.email,
			image: schema.user.image,
			alias: schema.user.alias
		})
		.from(schema.userInteractiveLearningChat)
		.innerJoin(schema.user, eq(schema.user.id, schema.userInteractiveLearningChat.userId))
		.innerJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
		.where(and(...conditions))
		.orderBy(sortDirection === 'asc' ? asc(schema.chat.createdAt) : desc(schema.chat.createdAt))
		.limit(pageSize)
		.offset(offset);

	if (sessions.length === 0) {
		return {
			interactive: interactiveRecord,
			sessions: [],
			pagination: { totalCount: total, totalPages, currentPage: page, pageSize },
			filters: { search: searchTerm, startDate: startDateStr, endDate: endDateStr },
			sorting: { direction: sortDirection }
		};
	}

	const chatIds = sessions.map((session) => session.chatId);

	const messages = await db
		.select({
			id: schema.agentMessage.id,
			chatId: schema.agentMessage.chatId,
			role: schema.agentMessage.role,
			textContent: schema.agentMessage.textContent,
			createdAt: schema.agentMessage.createdAt
		})
		.from(schema.agentMessage)
		.where(inArray(schema.agentMessage.chatId, chatIds))
		.orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));

	const assistantMessageIds = messages
		.filter((message) => message.role === 'assistant')
		.map((message) => message.id);

	const toolCalls =
		assistantMessageIds.length > 0
			? await db
					.select({
						messageId: schema.agentToolCall.messageId,
						status: schema.agentToolCall.status
					})
					.from(schema.agentToolCall)
					.where(inArray(schema.agentToolCall.messageId, assistantMessageIds))
			: [];

	const uiInstances =
		assistantMessageIds.length > 0
			? await db
					.select({
						messageId: schema.agentUIInstance.messageId,
						userResponse: schema.agentUIInstance.userResponse,
						componentKey: schema.agentUIComponent.componentKey
					})
					.from(schema.agentUIInstance)
					.innerJoin(
						schema.agentUIComponent,
						eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
					)
					.where(inArray(schema.agentUIInstance.messageId, assistantMessageIds))
			: [];

	const messageById = new Map(messages.map((message) => [message.id, message]));
	const messagesByChatId = new Map<string, typeof messages>();
	for (const message of messages) {
		const bucket = messagesByChatId.get(message.chatId) ?? [];
		bucket.push(message);
		messagesByChatId.set(message.chatId, bucket);
	}

	const toolCallsByChatId = new Map<string, typeof toolCalls>();
	for (const toolCall of toolCalls) {
		const message = messageById.get(toolCall.messageId);
		if (!message) continue;

		const bucket = toolCallsByChatId.get(message.chatId) ?? [];
		bucket.push(toolCall);
		toolCallsByChatId.set(message.chatId, bucket);
	}

	const uiInstancesByChatId = new Map<string, typeof uiInstances>();
	for (const uiInstance of uiInstances) {
		const message = messageById.get(uiInstance.messageId);
		if (!message) continue;

		const bucket = uiInstancesByChatId.get(message.chatId) ?? [];
		bucket.push(uiInstance);
		uiInstancesByChatId.set(message.chatId, bucket);
	}

	const enrichedSessions = sessions.map((session) => {
		const sessionMessages = messagesByChatId.get(session.chatId) ?? [];
		const sessionToolCalls = toolCallsByChatId.get(session.chatId) ?? [];
		const sessionUiInstances = uiInstancesByChatId.get(session.chatId) ?? [];

		const meaningfulMessages = sessionMessages.filter((message) => {
			if (message.role !== 'user' && message.role !== 'assistant') return false;
			if (message.role === 'user' && isInternalTriggerMessage(message.textContent)) return false;
			return !!cleanPreviewText(message.textContent);
		});

		const firstUsefulText = truncateText(cleanPreviewText(meaningfulMessages[0]?.textContent));
		const lastUsefulText = truncateText(
			cleanPreviewText(meaningfulMessages[meaningfulMessages.length - 1]?.textContent)
		);
		const previewText =
			firstUsefulText ??
			(sessionUiInstances[0] ? `Componente ${sessionUiInstances[0].componentKey}` : undefined);
		const latestText =
			lastUsefulText && lastUsefulText !== previewText ? lastUsefulText : undefined;

		const userMessages = sessionMessages.filter(
			(message) =>
				message.role === 'user' && !isInternalTriggerMessage(message.textContent)
		).length;
		const assistantMessages = sessionMessages.filter(
			(message) => message.role === 'assistant'
		).length;
		const failedToolCalls = sessionToolCalls.filter(
			(toolCall) => toolCall.status === 'failed' || toolCall.status === 'rejected'
		).length;
		const pendingToolCalls = sessionToolCalls.filter((toolCall) =>
			['pending', 'awaiting_confirmation', 'awaiting_ui_response', 'executing'].includes(
				toolCall.status
			)
		).length;
		const actionableUiInstances = sessionUiInstances.filter((uiInstance) =>
			uiComponentRequiresResponse(uiInstance.componentKey)
		);
		const respondedUiComponents = sessionUiInstances.filter(
			(uiInstance) =>
				!uiComponentRequiresResponse(uiInstance.componentKey) || !!uiInstance.userResponse
		).length;
		const pendingUiComponents = actionableUiInstances.filter(
			(uiInstance) => !uiInstance.userResponse
		).length;

		let status: SessionStatus = 'completed';
		if (failedToolCalls > 0) {
			status = 'attention';
		} else if (pendingToolCalls > 0 || pendingUiComponents > 0) {
			status = 'pending';
		}

		return {
			...session,
			previewText,
			latestText,
			status,
			lastActivityAt: session.chatUpdatedAt ?? session.chatCreatedAt,
			stats: {
				userMessages,
				assistantMessages,
				totalToolCalls: sessionToolCalls.length,
				failedToolCalls,
				pendingToolCalls,
				totalUiComponents: sessionUiInstances.length,
				respondedUiComponents
			}
		};
	});

	return {
		interactive: interactiveRecord,
		sessions: enrichedSessions,
		pagination: { totalCount: total, totalPages, currentPage: page, pageSize },
		filters: { search: searchTerm, startDate: startDateStr, endDate: endDateStr },
		sorting: { direction: sortDirection }
	};
}) satisfies PageServerLoad;
