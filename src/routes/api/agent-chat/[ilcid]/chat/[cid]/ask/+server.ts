/**
 * GET /api/agent-chat/[ilcid]/chat/[cid]/ask?message=...
 * Ejecuta el loop agéntico y devuelve un stream SSE de AgentStreamPart.
 *
 * Protocolo SSE: cada evento es un AgentStreamPart serializado como JSON.
 * El stream termina con { type: 'done', ... } seguido de `data: [DONE]`.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';
import { AgentEngine } from '$lib/server/agent/AgentEngine';
import type { AgentContext } from '$lib/types/agent';
import { markActivityInProgress } from '$lib/server/db/ProgressWriteUtils';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isPromptSafe } from '$lib/server/utils/moderation';
import { MODERATE_PROMPTS } from '$env/static/private';

export const GET: RequestHandler = async ({ url, params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Verificar acceso al chat específico
    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, params.cid!, params.ilcid!, user.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        return new Response(JSON.stringify({ error: chatAccess.reason || 'Sin acceso a este chat' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const userMessage = url.searchParams.get('message');
    const isResume = url.searchParams.get('resume') === 'true';
    const { ilcid, cid } = params;

    // En modo resume no requiere mensaje; en modo normal sí
    if (!isResume && (!userMessage || !ilcid || !cid)) {
        return sseError('Missing required parameters');
    }
    if (!ilcid || !cid) {
        return sseError('Missing required parameters');
    }

    // Moderación (solo para mensajes nuevos)
    let finalUserMessage = userMessage ?? '';
    if (!isResume && MODERATE_PROMPTS === 'true') {
        const isSafe = await isPromptSafe(finalUserMessage);
        if (!isSafe) {
            finalUserMessage = '[[El contenido enviado fue moderado por contener lenguaje inapropiado]]';
        }
    }

    try {
        // Cargar configuración de la actividad agéntica
        const agentActivity = await DBAgentUtils.getAgentActivity(ilcid);
        if (!agentActivity) {
            return sseError('Actividad agéntica no encontrada');
        }

        // Obtener CourseId para tracking de progreso
        const [courseRelation] = await db
            .select({ courseId: schema.courseInteractiveLearning.courseId })
            .from(schema.courseInteractiveLearning)
            .where(eq(schema.courseInteractiveLearning.interactiveLearningId, ilcid))
            .limit(1);
        const courseId = courseRelation?.courseId;

        // Marcar actividad en progreso
        if (courseId) {
            await markActivityInProgress({
                userId: user.id,
                courseId,
                activityId: ilcid,
                source: 'agent-chat:ask'
            });
        }

        // Cargar herramientas habilitadas para esta actividad
        const enabledTools = await DBAgentUtils.getEnabledToolsForActivity(ilcid);

        // Seed de herramientas builtin y componentes UI si no hay ninguna aún
        if (enabledTools.length === 0) {
            await DBAgentUtils.seedBuiltinTools();
            await DBAgentUtils.seedBuiltinUIComponents();
        }

        // Obtener historial de mensajes para el contexto (solo para executeLoop)
        const messageHistory = isResume ? [] : await DBAgentUtils.getAgentMessages(cid);

        // Construir el contexto del agente
        const context: AgentContext = {
            userId: user.id,
            courseId,
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
            messageHistory
        };

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Elegir entre loop normal o resume post-HITL
                    const generator = isResume
                        ? AgentEngine.resumeFromToolCall(context)
                        : AgentEngine.executeLoop(context, finalUserMessage);

                    for await (const part of generator) {
                        const data = JSON.stringify(part);
                        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                } catch (error) {
                    const errPart = JSON.stringify({
                        type: 'error',
                        code: 'INTERNAL_ERROR',
                        message: error instanceof Error ? error.message : 'Error interno del servidor'
                    });
                    controller.enqueue(encoder.encode(`data: ${errPart}\n\n`));
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        });
    } catch (error) {
        console.error('[agent-chat] ask error:', error);
        return sseError('Error interno del servidor');
    }
};

function sseError(message: string): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', code: 'REQUEST_ERROR', message })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        }
    });
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache'
        }
    });
}
