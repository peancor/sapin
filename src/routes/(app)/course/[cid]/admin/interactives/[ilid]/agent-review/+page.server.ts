import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import { eq, and, inArray, like, desc, asc, count, sql } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { DBAgentActivityUtils } from '$lib/server/db/agent';

export const load = (async ({ params, url, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const { cid, ilid } = params;

    const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
        locals.user.id, cid, ilid, locals.user.highestRoleLevel
    );
    if (!access.allowed) throw error(403, access.reason || 'Sin permisos');

    // Only for agent-type activities
    const [interactiveRecord] = await db
        .select()
        .from(schema.interactiveLearning)
        .where(eq(schema.interactiveLearning.id, ilid));

    if (!interactiveRecord) throw error(404, 'Actividad no encontrada');
    if (interactiveRecord.type !== 'agent') {
        throw redirect(303, `/course/${cid}/admin/interactives/${ilid}/chat-review`);
    }

    const agentConfig = await DBAgentActivityUtils.getAgentActivity(ilid);

    // Parse query params
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.max(1, parseInt(url.searchParams.get('pageSize') || '10'));
    const searchTerm = url.searchParams.get('search') || undefined;
    const sortDirection = (url.searchParams.get('sortDirection') || 'desc') as 'asc' | 'desc';
    const startDateStr = url.searchParams.get('startDate');
    const endDateStr = url.searchParams.get('endDate');
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59') : undefined;

    // Build the sessions query with user join
    // First count total
    const conditions = [
        eq(schema.userInteractiveLearningChat.interactiveLearningChatId, ilid),
        ...(searchTerm ? [like(schema.user.username, `%${searchTerm}%`)] : []),
        ...(startDate
            ? [sql`${schema.chat.createdAt} >= ${startDate.getTime() / 1000}`]
            : []),
        ...(endDate
            ? [sql`${schema.chat.createdAt} <= ${endDate.getTime() / 1000}`]
            : [])
    ];

    const [{ total }] = await db
        .select({ total: count(schema.userInteractiveLearningChat.id) })
        .from(schema.userInteractiveLearningChat)
        .innerJoin(schema.user, eq(schema.user.id, schema.userInteractiveLearningChat.userId))
        .innerJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
        .where(and(...conditions));

    const offset = (page - 1) * pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Load paginated sessions
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
            agentConfig,
            sessions: [],
            pagination: { totalCount: total, totalPages, currentPage: page, pageSize },
            filters: { search: searchTerm, startDate: startDateStr, endDate: endDateStr },
            sorting: { direction: sortDirection }
        };
    }

    const chatIds = sessions.map(s => s.chatId);

    // Load all messages for these sessions in one query
    const messages = await db
        .select()
        .from(schema.agentMessage)
        .where(inArray(schema.agentMessage.chatId, chatIds))
        .orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));

    const messageIds = messages.map(m => m.id);

    // Load all tool calls for these messages
    const toolCalls = messageIds.length > 0
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
                toolDisplayName: schema.agentToolDefinition.displayName
            })
            .from(schema.agentToolCall)
            .leftJoin(
                schema.agentToolDefinition,
                eq(schema.agentToolCall.toolDefinitionId, schema.agentToolDefinition.id)
            )
            .where(inArray(schema.agentToolCall.messageId, messageIds))
        : [];

    // Group tool calls by messageId
    const toolCallsByMessageId = new Map<string, typeof toolCalls>();
    for (const tc of toolCalls) {
        const existing = toolCallsByMessageId.get(tc.messageId) ?? [];
        existing.push(tc);
        toolCallsByMessageId.set(tc.messageId, existing);
    }

    // Group messages by chatId and enrich with tool calls
    const messagesByChatId = new Map<string, typeof enrichedMessages>();
    type EnrichedMessage = (typeof messages)[0] & {
        toolCalls: typeof toolCalls;
    };
    const enrichedMessages: EnrichedMessage[] = messages.map(m => ({
        ...m,
        toolCalls: toolCallsByMessageId.get(m.id) ?? []
    }));
    for (const msg of enrichedMessages) {
        const existing = messagesByChatId.get(msg.chatId) ?? [];
        existing.push(msg);
        messagesByChatId.set(msg.chatId, existing);
    }

    // Assemble final session objects
    const enrichedSessions = sessions.map(s => {
        const msgs = messagesByChatId.get(s.chatId) ?? [];
        const userMessages = msgs.filter(m => m.role === 'user').length;
        const assistantMessages = msgs.filter(m => m.role === 'assistant').length;
        const totalToolCalls = msgs.reduce((sum, m) => sum + m.toolCalls.length, 0);

        return {
            ...s,
            messages: msgs,
            stats: { userMessages, assistantMessages, totalToolCalls }
        };
    });

    return {
        interactive: interactiveRecord,
        agentConfig,
        sessions: enrichedSessions,
        pagination: { totalCount: total, totalPages, currentPage: page, pageSize },
        filters: { search: searchTerm, startDate: startDateStr, endDate: endDateStr },
        sorting: { direction: sortDirection }
    };
}) satisfies PageServerLoad;
