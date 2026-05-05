import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { AgentSessionAnalyticsService } from '$lib/server/agent';

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
	const studentMessagesFilter =
		url.searchParams.get('studentMessages') === 'without'
			? 'without'
			: url.searchParams.get('studentMessages') === 'with'
				? 'with'
				: 'all';
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

	const allSessions = await db
		.select({
			sessionId: schema.userInteractiveLearningChat.id,
			chatId: schema.userInteractiveLearningChat.chatId,
			userId: schema.userInteractiveLearningChat.userId,
			sessionCreatedAt: schema.userInteractiveLearningChat.createdAt,
			chatCreatedAt: schema.chat.createdAt,
			chatUpdatedAt: schema.chat.updatedAt,
			chatMetadata: schema.chat.metadata,
			username: schema.user.username,
			email: schema.user.email,
			image: schema.user.image,
			alias: schema.user.alias
		})
		.from(schema.userInteractiveLearningChat)
		.innerJoin(schema.user, eq(schema.user.id, schema.userInteractiveLearningChat.userId))
		.innerJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
		.where(and(...conditions))
		.orderBy(sortDirection === 'asc' ? asc(schema.chat.createdAt) : desc(schema.chat.createdAt));

	if (allSessions.length === 0) {
		return {
			interactive: interactiveRecord,
			sessions: [],
			pagination: { totalCount: 0, totalPages: 1, currentPage: 1, pageSize },
			filters: {
				search: searchTerm,
				startDate: startDateStr,
				endDate: endDateStr,
				studentMessages: studentMessagesFilter
			},
			sorting: { direction: sortDirection }
		};
	}

	const chatIds = allSessions.map((session) => session.chatId);

	const messages = await db
		.select()
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
						id: schema.agentToolCall.id,
						messageId: schema.agentToolCall.messageId,
						status: schema.agentToolCall.status,
						result: schema.agentToolCall.result
					})
					.from(schema.agentToolCall)
					.where(inArray(schema.agentToolCall.messageId, assistantMessageIds))
			: [];

	const uiInstances =
		assistantMessageIds.length > 0
			? await db
					.select({
						id: schema.agentUIInstance.id,
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

	const summaries = AgentSessionAnalyticsService.summarizeSessions({
		chats: allSessions.map((session) => ({
			id: session.chatId,
			metadata: session.chatMetadata,
			createdAt: session.chatCreatedAt,
			updatedAt: session.chatUpdatedAt
		})),
		messages,
		toolCalls,
		uiInstances
	});

	const computedSessions = allSessions.flatMap((session) => {
			const summary = summaries.get(session.chatId);
			if (!summary) return [];

			return [
				{
				...session,
				previewText: summary.previewText,
				latestText: summary.latestText,
				status: summary.status,
				hasStudentMessages: summary.hasStudentMessages,
				lastActivityAt: summary.lastActivityAt,
				finalization: summary.finalization,
				stats: summary.stats,
				globalStats: summary.globalStats
				}
			];
		});

	const filteredSessions = computedSessions
		.filter((session) => {
			if (studentMessagesFilter === 'with') return session.hasStudentMessages;
			if (studentMessagesFilter === 'without') return !session.hasStudentMessages;
			return true;
		});

	const totalCount = filteredSessions.length;
	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
	const currentPage = Math.min(page, totalPages);
	const offset = (currentPage - 1) * pageSize;
	const paginatedSessions = filteredSessions.slice(offset, offset + pageSize);

	return {
		interactive: interactiveRecord,
		sessions: paginatedSessions,
		pagination: { totalCount, totalPages, currentPage, pageSize },
		filters: {
			search: searchTerm,
			startDate: startDateStr,
			endDate: endDateStr,
			studentMessages: studentMessagesFilter
		},
		sorting: { direction: sortDirection }
	};
}) satisfies PageServerLoad;
