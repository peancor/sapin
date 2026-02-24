import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import { eq, asc } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';
import type { AgentDisplayMessage, AgentDisplayPart } from '$lib/types/agent';

export const load = (async ({ params, locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Not authenticated');

    const { ilid, cid } = params;

    // Verificar acceso al chat
    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, cid, ilid, user.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        throw error(403, chatAccess.reason || 'No tienes acceso a este chat');
    }

    // Cargar mensajes agénticos
    const rawMessages = await DBAgentUtils.getAgentMessagesRaw(cid);

    // Cargar tool calls e instancias UI para los mensajes assistant
    const assistantMessageIds = rawMessages
        .filter((m) => m.role === 'assistant')
        .map((m) => m.id);

    const toolCallsMap: Record<string, typeof schema.agentToolCall.$inferSelect[]> = {};
    if (assistantMessageIds.length > 0) {
        for (const msgId of assistantMessageIds) {
            toolCallsMap[msgId] = await db
                .select()
                .from(schema.agentToolCall)
                .where(eq(schema.agentToolCall.messageId, msgId));
        }
    }

    // Reconstruir los mensajes de display
    const displayMessages: AgentDisplayMessage[] = [];

    for (const msg of rawMessages) {
        // Solo mostrar user y assistant (no system ni tool internos)
        if (msg.role !== 'user' && msg.role !== 'assistant') continue;

        const parts: AgentDisplayPart[] = [];

        // Texto principal
        if (msg.textContent) {
            parts.push({ kind: 'text', content: msg.textContent });
        }

        // Tool calls dentro del mensaje assistant
        if (msg.role === 'assistant' && toolCallsMap[msg.id]) {
            for (const tc of toolCallsMap[msg.id]) {
                let args: Record<string, unknown> = {};
                let result: unknown = undefined;
                try { args = JSON.parse(tc.arguments) as Record<string, unknown>; } catch { /* */ }
                try { result = tc.result ? JSON.parse(tc.result) : undefined; } catch { /* */ }

                parts.push({
                    kind: 'tool-call',
                    toolCallId: tc.id,
                    toolName: tc.toolName,
                    toolDisplayName: tc.toolName, // se puede enriquecer con el catálogo
                    args,
                    status: tc.status as 'executing' | 'completed' | 'failed' | 'rejected',
                    result,
                    durationMs: tc.durationMs ?? undefined
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

    // Cargar datos de la actividad para mostrar en el header
    const [interactiveLearning] = await db
        .select()
        .from(schema.interactiveLearning)
        .where(eq(schema.interactiveLearning.id, ilid));

    return {
        chatId: cid,
        activityId: ilid,
        messages: displayMessages,
        interactiveLearning,
        isOwner: chatAccess.isOwner,
        user: {
            username: user.username ?? undefined,
            alias: user.alias ?? undefined
        }
    };
}) satisfies PageServerLoad;
