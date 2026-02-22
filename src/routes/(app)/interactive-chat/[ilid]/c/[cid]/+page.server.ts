import type { PageServerLoad } from './$types';
import { db, InteractiveChatAuthUtils } from '$lib/server/db';
import { message } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load = (async ({ params, locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Not authenticated');

    const chatInstance = params.cid;
    const { ilid } = params;

    // Verificar acceso al chat específico
    // - El usuario debe ser el propietario del chat, O
    // - El usuario debe ser profesor/admin del curso
    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, chatInstance, ilid, user.highestRoleLevel
    );

    if (!chatAccess.allowed) {
        throw error(403, chatAccess.reason || 'No tienes acceso a este chat');
    }

    // Fetch messages for this chat instance
    const messages = await db
        .select()
        .from(message)
        .where(eq(message.chatId, chatInstance))
        .orderBy(message.createdAt);

    return {
        chatInstance,
        messages,
        isOwner: chatAccess.isOwner
    };
}) satisfies PageServerLoad;