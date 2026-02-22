import type { RequestHandler } from '@sveltejs/kit';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { InteractiveChatAuthUtils } from '$lib/server/db';

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

    const question = url.searchParams.get('question');
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

    try {
        // Save user message
        await AIUtils.saveMessage(cid, question, 'USER');

        // Get streaming response using Vercel AI SDK
        const result = await AIUtils.streamChatResponse(ilcid, cid, question);

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

                    // Save assistant response
                    await AIUtils.saveMessage(cid, assistantResponse, 'ASSISTANT');
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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

export const POST: RequestHandler = async ({ request, params, locals }) => {
    // Verificar autenticación
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { question } = await request.json();
    const { cid, ilcid } = params;

    if (!cid || !ilcid) {
        return new Response(JSON.stringify({ error: 'Chat ID and Interactive Learning Chat ID are required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Verificar acceso al chat específico
    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, cid, ilcid, user.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        return new Response(JSON.stringify({ error: chatAccess.reason || 'Sin acceso a este chat' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Save user message
        await AIUtils.saveMessage(cid, question, 'USER');

        // Get streaming response
        const result = await AIUtils.streamChatResponse(ilcid, cid, question);

        const encoder = new TextEncoder();
        let assistantResponse = '';

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of result.textStream) {
                        assistantResponse += chunk;
                        controller.enqueue(encoder.encode(JSON.stringify({ text: chunk })));
                    }

                    await AIUtils.saveMessage(cid, assistantResponse, 'ASSISTANT');
                    controller.enqueue(encoder.encode('[DONE]'));
                    controller.close();
                } catch (err) {
                    console.error('Error streaming response:', err);
                    controller.error(err);
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive'
            }
        });
    } catch (error) {
        console.error('Error initializing model:', error);
        return new Response(JSON.stringify({ error: 'Failed to initialize model' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
