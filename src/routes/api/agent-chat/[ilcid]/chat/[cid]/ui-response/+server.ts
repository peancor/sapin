/**
 * POST /api/agent-chat/[ilcid]/chat/[cid]/ui-response
 * Recibe la respuesta del usuario a un componente UI interactivo.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { DBAgentMessageUtils, DBAgentUIUtils } from '$lib/server/db/agent';

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, params.cid!, params.ilcid!, user.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        return json({ error: chatAccess.reason || 'Sin acceso a este chat' }, { status: 403 });
    }

    let body: { instanceId: string; componentKey?: string; payload: Record<string, unknown> };
    try {
        body = await request.json() as typeof body;
    } catch {
        return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { instanceId, componentKey, payload } = body;
    if (!instanceId || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return json({ error: 'instanceId and payload are required' }, { status: 400 });
    }

    // Verificar que la instancia existe
    const instance = await DBAgentUIUtils.getUIInstance(instanceId);
    if (!instance) {
        return json({ error: 'UI instance not found' }, { status: 404 });
    }

    // Una sola respuesta por instancia
    if (instance.respondedAt) {
        return json({ error: 'UI instance already responded' }, { status: 409 });
    }

    // Validar pertenencia de la instancia al chat actual
    const [message] = await db
        .select({
            id: schema.agentMessage.id,
            chatId: schema.agentMessage.chatId
        })
        .from(schema.agentMessage)
        .where(eq(schema.agentMessage.id, instance.messageId))
        .limit(1);

    if (!message || message.chatId !== params.cid) {
        return json({ error: 'UI instance does not belong to this chat' }, { status: 403 });
    }

    // Resolver componentKey real y validar consistencia opcional
    const [uiComponent] = await db
        .select({
            componentKey: schema.agentUIComponent.componentKey
        })
        .from(schema.agentUIComponent)
        .where(eq(schema.agentUIComponent.id, instance.uiComponentId))
        .limit(1);

    if (!uiComponent) {
        return json({ error: 'UI component not found' }, { status: 404 });
    }
    if (componentKey && componentKey !== uiComponent.componentKey) {
        return json({ error: 'componentKey mismatch' }, { status: 400 });
    }

    // Resolver toolCall asociado (metadata -> fallback por mensaje/resultado)
    let resolvedToolCall = null as typeof schema.agentToolCall.$inferSelect | null;

    if (instance.metadata) {
        try {
            const metadata = JSON.parse(instance.metadata) as Record<string, unknown>;
            const metadataToolCallId = metadata.toolCallId;
            if (typeof metadataToolCallId === 'string') {
                const toolCall = await DBAgentMessageUtils.getToolCall(metadataToolCallId);
                if (toolCall && toolCall.messageId === instance.messageId) {
                    resolvedToolCall = toolCall;
                }
            }
        } catch {
            // Metadata histórica inválida: continuar con fallback
        }
    }

    if (!resolvedToolCall) {
        const toolCalls = await db
            .select()
            .from(schema.agentToolCall)
            .where(eq(schema.agentToolCall.messageId, instance.messageId));

        resolvedToolCall =
            toolCalls.find((tc) => tc.status === 'awaiting_ui_response') ??
            toolCalls.find((tc) => {
                if (!tc.result) return false;
                try {
                    const result = JSON.parse(tc.result) as Record<string, unknown>;
                    return result.instanceId === instanceId;
                } catch {
                    return false;
                }
            }) ??
            null;
    }

    if (!resolvedToolCall) {
        return json({ error: 'Associated tool call not found for this UI instance' }, { status: 409 });
    }

    // Persistir respuesta del usuario en la instancia
    const score = typeof payload.score === 'number' ? payload.score : undefined;

    await DBAgentUIUtils.updateUIInstance(instanceId, {
        userResponse: JSON.stringify(payload),
        respondedAt: new Date(),
        ...(score !== undefined ? { score } : {})
    });

    const renderedResult = resolvedToolCall.result ?? JSON.stringify({
        rendered: true,
        componentKey: uiComponent.componentKey,
        instanceId
    });

    await DBAgentMessageUtils.updateToolCall(resolvedToolCall.id, {
        status: 'completed',
        result: renderedResult,
        errorMessage: null
    });

    await DBAgentMessageUtils.saveAgentMessage({
        chatId: params.cid!,
        role: 'tool',
        textContent: JSON.stringify(payload),
        toolCallId: resolvedToolCall.id,
        toolName: resolvedToolCall.toolName,
        sequenceOrder: 3
    });

    return json({ success: true, resumeSuggested: true });
};
