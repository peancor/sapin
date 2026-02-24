import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';
import type { AgentDisplayMessage, AgentDisplayPart } from '$lib/types/agent';

export const load = (async ({ params, locals }) => {
    const user = locals.user;
    if (!user) throw redirect(302, '/login');

    const { cid } = params;

    // Verify the chat belongs to this user
    const userChat = await db
        .select()
        .from(schema.userInteractiveLearningChat)
        .where(
            and(
                eq(schema.userInteractiveLearningChat.chatId, cid),
                eq(schema.userInteractiveLearningChat.userId, user.id)
            )
        )
        .get();

    if (!userChat) throw error(403, 'No tienes acceso a este chat');

    // Load messages
    const rawMessages = await DBAgentUtils.getAgentMessagesRaw(cid);

    const assistantMessageIds = rawMessages
        .filter((m) => m.role === 'assistant')
        .map((m) => m.id);

    const toolCallsMap: Record<string, typeof schema.agentToolCall.$inferSelect[]> = {};
    const uiInstancesMap: Record<string, (typeof schema.agentUIInstance.$inferSelect & { componentKey: string })[]> = {};

    for (const msgId of assistantMessageIds) {
        toolCallsMap[msgId] = await db
            .select()
            .from(schema.agentToolCall)
            .where(eq(schema.agentToolCall.messageId, msgId));

        const uiRows = await db
            .select({
                instance: schema.agentUIInstance,
                componentKey: schema.agentUIComponent.componentKey
            })
            .from(schema.agentUIInstance)
            .innerJoin(
                schema.agentUIComponent,
                eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
            )
            .where(eq(schema.agentUIInstance.messageId, msgId));

        uiInstancesMap[msgId] = uiRows.map((r) => ({ ...r.instance, componentKey: r.componentKey }));
    }

    const displayMessages: AgentDisplayMessage[] = [];

    for (const msg of rawMessages) {
        if (msg.role !== 'user' && msg.role !== 'assistant') continue;

        const parts: AgentDisplayPart[] = [];

        if (msg.textContent) {
            parts.push({ kind: 'text', content: msg.textContent });
        }

        if (msg.role === 'assistant' && toolCallsMap[msg.id]) {
            for (const tc of toolCallsMap[msg.id]) {
                let args: Record<string, unknown> = {};
                let result: unknown = undefined;
                try { args = JSON.parse(tc.arguments) as Record<string, unknown>; } catch { /* */ }
                try { result = tc.result ? JSON.parse(tc.result) : undefined; } catch { /* */ }

                const cleanResult = result as Record<string, unknown> | null;
                if (cleanResult && typeof cleanResult === 'object' && 'rendered' in cleanResult) continue;

                parts.push({
                    kind: 'tool-call',
                    toolCallId: tc.id,
                    toolName: tc.toolName,
                    toolDisplayName: tc.toolName,
                    args,
                    status: tc.status as 'executing' | 'completed' | 'failed' | 'rejected',
                    result,
                    durationMs: tc.durationMs ?? undefined
                });
            }
        }

        if (msg.role === 'assistant' && uiInstancesMap[msg.id]) {
            for (const ui of uiInstancesMap[msg.id]) {
                let props: Record<string, unknown> = {};
                let userResponse: Record<string, unknown> | undefined;
                try { props = JSON.parse(ui.props) as Record<string, unknown>; } catch { /* */ }
                if (ui.userResponse) {
                    try { userResponse = JSON.parse(ui.userResponse) as Record<string, unknown>; } catch { /* */ }
                }
                parts.push({
                    kind: 'ui-component',
                    instanceId: ui.id,
                    componentKey: ui.componentKey,
                    props,
                    interactive: !userResponse,
                    userResponse
                });
            }
        }

        if (parts.length > 0) {
            displayMessages.push({
                id: msg.id,
                role: msg.role as 'user' | 'assistant',
                parts,
                createdAt: msg.createdAt
            });
        }
    }

    return {
        chatId: cid,
        activityId: DBAgentUtils.GLOBAL_TUTOR_ID,
        messages: displayMessages,
        user: {
            username: user.username ?? undefined,
            alias: user.alias ?? undefined
        }
    };
}) satisfies PageServerLoad;
