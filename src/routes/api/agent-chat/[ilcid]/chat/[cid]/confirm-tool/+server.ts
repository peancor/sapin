/**
 * POST /api/agent-chat/[ilcid]/chat/[cid]/confirm-tool
 * Confirma o rechaza una herramienta pendiente de aprobación (HITL).
 *
 * Body: { toolCallId: string, approved: boolean, rejectionReason?: string }
 *
 * Si approved:
 *   - Ejecuta la herramienta real
 *   - Guarda el resultado en agentToolCall + agentMessage (role='tool')
 *   - Retorna { success: true, result, displayText }
 * Si !approved:
 *   - Marca como 'rejected' en DB
 *   - Retorna { success: true, rejected: true }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';
import { ToolExecutor } from '$lib/server/agent/ToolExecutor';
import type { AgentContext } from '$lib/types/agent';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) return new Response('Unauthorized', { status: 401 });

    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, params.cid!, params.ilcid!, user.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        return json({ error: chatAccess.reason || 'Sin acceso' }, { status: 403 });
    }

    const { ilcid, cid } = params;
    if (!ilcid || !cid) return json({ error: 'Parámetros requeridos' }, { status: 400 });

    let body: { toolCallId: string; approved: boolean; rejectionReason?: string };
    try {
        body = await request.json() as typeof body;
    } catch {
        return json({ error: 'Body JSON inválido' }, { status: 400 });
    }

    const { toolCallId, approved, rejectionReason } = body;
    if (!toolCallId || typeof approved !== 'boolean') {
        return json({ error: 'toolCallId y approved son requeridos' }, { status: 400 });
    }

    // Buscar el tool call en la BD
    const toolCall = await DBAgentUtils.getToolCall(toolCallId);
    if (!toolCall) return json({ error: 'Tool call no encontrado' }, { status: 404 });

    if (toolCall.status !== 'awaiting_confirmation') {
        return json({ error: `Tool call en estado "${toolCall.status}", no se puede confirmar` }, { status: 409 });
    }

    const now = new Date();

    if (!approved) {
        // Rechazado
        await DBAgentUtils.updateToolCall(toolCallId, {
            status: 'rejected',
            errorMessage: rejectionReason ?? 'Rechazado por el usuario',
            confirmedAt: now
        });

        // Guardar mensaje tool con resultado de rechazo para que el LLM sepa
        await DBAgentUtils.saveAgentMessage({
            chatId: cid,
            role: 'tool',
            textContent: JSON.stringify({ rejected: true, reason: rejectionReason ?? 'El usuario rechazó la ejecución de la herramienta.' }),
            toolCallId,
            toolName: toolCall.toolName,
            sequenceOrder: 3
        });

        return json({ success: true, rejected: true });
    }

    // Aprobado — ejecutar la herramienta
    await DBAgentUtils.updateToolCall(toolCallId, {
        status: 'executing',
        confirmedBy: user.id,
        confirmedAt: now
    });

    // Reconstruir contexto mínimo para ejecutar la herramienta
    const agentActivity = await DBAgentUtils.getAgentActivity(ilcid);
    if (!agentActivity) return json({ error: 'Actividad no encontrada' }, { status: 404 });

    const enabledTools = await DBAgentUtils.getEnabledToolsForActivity(ilcid);

    const [courseRelation] = await db
        .select({ courseId: schema.courseInteractiveLearning.courseId })
        .from(schema.courseInteractiveLearning)
        .where(eq(schema.courseInteractiveLearning.interactiveLearningId, ilcid))
        .limit(1);

    const context: AgentContext = {
        userId: user.id,
        courseId: courseRelation?.courseId,
        chatId: cid,
        activityId: ilcid,
        activityConfig: {
            llmModel: agentActivity.llmModel,
            llmRole: agentActivity.llmRole,
            llmInstructions: agentActivity.llmInstructions,
            llmContext: agentActivity.llmContext,
            systemPrompt: agentActivity.systemPrompt,
            temperature: agentActivity.temperature,
            maxTokens: agentActivity.maxTokens,
            topP: agentActivity.topP,
            maxToolRoundtrips: agentActivity.maxToolRoundtrips,
            parallelToolCalls: agentActivity.parallelToolCalls,
            toolChoice: agentActivity.toolChoice as 'auto' | 'required' | 'none',
            ragEnabled: agentActivity.ragEnabled,
            ragCollectionName: agentActivity.ragCollectionName,
            ragConfig: agentActivity.ragConfig as string | null
        },
        enabledTools,
        messageHistory: []
    };

    // Parsear los argumentos guardados
    let toolArgs: Record<string, unknown> = {};
    try { toolArgs = JSON.parse(toolCall.arguments) as Record<string, unknown>; } catch { /* ignore */ }

    // Ejecutar la herramienta
    const execResult = await ToolExecutor.execute(toolCall.toolName, toolArgs, context);

    const resultData = execResult.success ? execResult.data : { error: execResult.errorMessage };

    await DBAgentUtils.updateToolCall(toolCallId, {
        result: JSON.stringify(resultData),
        status: execResult.success ? 'completed' : 'failed',
        errorMessage: execResult.success ? undefined : execResult.errorMessage
    });

    // Guardar mensaje tool para que el LLM tenga el resultado al retomar
    await DBAgentUtils.saveAgentMessage({
        chatId: cid,
        role: 'tool',
        textContent: JSON.stringify(resultData),
        toolCallId,
        toolName: toolCall.toolName,
        sequenceOrder: 3
    });

    return json({
        success: true,
        result: resultData,
        displayText: execResult.displayText
    });
};
