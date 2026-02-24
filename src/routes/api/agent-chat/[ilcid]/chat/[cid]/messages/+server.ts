/**
 * GET /api/agent-chat/[ilcid]/chat/[cid]/messages
 * Devuelve todos los mensajes de un chat agéntico para reconstruir la UI.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, params.cid!, params.ilcid!, user.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        return json({ error: chatAccess.reason || 'Sin acceso a este chat' }, { status: 403 });
    }

    try {
        // Obtener mensajes agénticos con sus tool calls e instancias UI
        const messages = await DBAgentUtils.getAgentMessagesRaw(params.cid!);

        // Para cada mensaje assistant, obtener sus tool calls y UI instances
        const messagesWithDetails = await Promise.all(
            messages.map(async (msg) => {
                if (msg.role !== 'assistant') {
                    return { ...msg, toolCalls: [], uiInstances: [] };
                }

                const toolCalls = await db
                    .select()
                    .from(schema.agentToolCall)
                    .where(eq(schema.agentToolCall.messageId, msg.id));

                const uiInstances = await db
                    .select()
                    .from(schema.agentUIInstance)
                    .where(eq(schema.agentUIInstance.messageId, msg.id));

                return { ...msg, toolCalls, uiInstances };
            })
        );

        // Filtrar mensajes tool internos (no se muestran al usuario) excepto para debugging
        const displayMessages = messagesWithDetails.filter(
            (m) => m.role === 'user' || m.role === 'assistant'
        );

        return json({ messages: displayMessages });
    } catch (error) {
        console.error('[agent-chat] GET messages error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
