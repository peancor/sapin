import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, InteractiveChatAuthUtils } from '$lib/server/db';
import { message, messageType } from '$lib/server/db/schema';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    // Verificar autenticación
    const userId = locals.user?.id;
    if (!userId) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar acceso al chat específico
    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        userId, params.cid!, params.ilcid!, locals.user!.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        return json({ error: chatAccess.reason || 'Sin acceso a este chat' }, { status: 403 });
    }

    const { content, type = 'user', tokenCount = 0, finishReason = 'stop' } = await request.json();
    const { cid } = params;

    // Validar tipo de mensaje
    if (!Object.keys(messageType).map(k => messageType[k as keyof typeof messageType]).includes(type)) {
        return json({ error: 'Invalid message type' }, { status: 400 });
    }

    // Validar contenido
    if (!content || typeof content !== 'string') {
        return json({ error: 'Content is required and must be a string' }, { status: 400 });
    }

    try {
        // Crear mensaje
        const newMessage = await db.insert(message).values({
            id: nanoid(),
            chatId: cid,
            content,
            type,
            tokenCount,
            finishReason,
            createdAt: new Date()
        }).returning().get();

        return json(newMessage);
    } catch (error) {
        console.error('Error creating message:', error);
        return json({ error: 'Failed to create message' }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ params, locals }) => {
    // Verificar autenticación
    const userId = locals.user?.id;
    if (!userId) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar acceso al chat específico
    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        userId, params.cid!, params.ilcid!, locals.user!.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        return json({ error: chatAccess.reason || 'Sin acceso a este chat' }, { status: 403 });
    }

    const { cid } = params;

    try {
        const messages = await db
            .select()
            .from(message)
            .where(eq(message.chatId, cid!))
            .orderBy(message.createdAt)
            .all();

        return json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        return json({ error: 'Failed to fetch messages' }, { status: 500 });
    }
};