import type { RequestHandler } from '@sveltejs/kit';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { isPromptSafe } from '$lib/server/utils/moderation';
import { MODERATE_PROMPTS } from '$env/static/private';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import { markActivityCompleted, markActivityInProgress } from '$lib/server/db/ProgressWriteUtils';

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

    let question = url.searchParams.get('question');
    const { ilcid, cid } = params;

    if (!question || !ilcid || !cid) {
        return new Response('data: {"error": "Missing required parameters"}\n\n', {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    }

    // Moderation check if enabled
    if (MODERATE_PROMPTS === 'true') {
        console.log('Moderando pregunta:', question);
        const isSafe = await isPromptSafe(question);
        console.log('Es seguro:', isSafe);
        if (!isSafe) {
            question = '[[Informa al usuario de que se ha detectado contenido inapropiado]]';
        }
    }

    try {
        const messageMetadata = url.searchParams.get('metadata') || '{}';

        // Save user message
        await AIUtils.saveMessage(cid, question, 'USER', messageMetadata);

        const courseId = await AIUtils.getCourseIdByInteractiveLearningId(ilcid);
        if (courseId) {
            await markActivityInProgress({
                userId: user.id,
                courseId,
                activityId: ilcid,
                source: 'interactive-chat:ask'
            });
        }

        // Get streaming response using Vercel AI SDK, passing userId for usage tracking
        const result = await AIUtils.streamChatResponse(ilcid, cid, question, user.id);

        const encoder = new TextEncoder();
        let assistantResponse = '';

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    controller.enqueue(encoder.encode('data: {"text": ""}\n\n'));

                    for await (const chunk of result.textStream) {
                        assistantResponse += chunk;
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
                    }

                    const isFirstDoneMessage = await AIUtils.isFirstDoneMessage(cid, assistantResponse);

                    // Save assistant response
                    await AIUtils.saveMessage(cid, assistantResponse, 'ASSISTANT');
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));

                    // Check for [[DONE]] marker and notify if first occurrence
                    if (isFirstDoneMessage) {
                        console.log('Notificando el mensaje [[DONE]]. Enviando notificación.');
                        await AIUtils.notifyEndOfChat(cid, ilcid, user.id);

                        if (courseId) {
                            await markActivityCompleted({
                                userId: user.id,
                                courseId,
                                activityId: ilcid,
                                source: 'interactive-chat:done'
                            });
                        }
                    }

                    controller.close();
                } catch (err) {
                    console.error('Error en el servidor:', err);
                    controller.enqueue(encoder.encode('data: {"error": "Error procesando la pregunta"}\n\n'));
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
        console.error('Error initializing chat:', error);
        return new Response('data: {"error": "Model not available"}\n\n', {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    }
};