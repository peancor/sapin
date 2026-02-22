import type { RequestHandler } from '@sveltejs/kit';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { ROLE_LEVELS } from '$lib/server/roles';

export const GET: RequestHandler = async ({ url, params, locals }) => {
    // Verificar que el usuario es admin usando el nuevo sistema de roles
    if (!locals.user || locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) {
        return new Response('data: {"error": "No autorizado"}\n\n', {
            status: 401,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    }

    const question = url.searchParams.get('question');
    const modelName = params.model;

    if (!question) {
        return new Response('data: {"error": "No se proporcionó pregunta"}\n\n', {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    }

    if (!modelName) {
        return new Response('data: {"error": "No se proporcionó modelo"}\n\n', {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    }

    try {
        // Pasar contexto del usuario para registrar el uso
        const result = await AIUtils.streamTextFromPrompt(question, modelName, {
            userId: locals.user.id
        });

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    controller.enqueue(encoder.encode('data: {"text": ""}\n\n'));

                    for await (const chunk of result.textStream) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
                    }

                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                } catch (err) {
                    console.error('Error en el servidor:', err);
                    controller.enqueue(encoder.encode(`data: {"error": "Error procesando: ${err instanceof Error ? err.message : 'Error desconocido'}"}\n\n`));
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
        console.error('Error initializing model:', error);
        return new Response(`data: {"error": "Modelo no disponible: ${error instanceof Error ? error.message : 'Error desconocido'}"}\n\n`, {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    }
};
