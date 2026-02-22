import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { and, eq } from 'drizzle-orm';
import { interactiveLearningChat, userInteractiveLearningChat, chat } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';

export const load = (async ({ params, parent, locals }) => {
    const { ilid } = params;
    const { user } = locals;

    // El layout ya verifica autenticación, pero TypeScript necesita esta verificación
    if (!user) {
        throw error(401, 'Not authenticated');
    }

    // First, find the interactive learning chat
    const iLearningChat = (await parent()).chat;
    if (!iLearningChat) {
        throw error(404, 'Interactive learning chat not found');
    }

    // Fetch all chats linked to this interactive learning chat AND the current user
    const userChats = await db
        .select({
            userChat: userInteractiveLearningChat,
            chatData: chat
        })
        .from(userInteractiveLearningChat)
        .leftJoin(chat, eq(userInteractiveLearningChat.chatId, chat.id))
        .where(and(
            eq(userInteractiveLearningChat.interactiveLearningChatId, iLearningChat.id),
            eq(userInteractiveLearningChat.userId, user.id)
        ))
        .all();

    return {
        iLearningChat,
        userChats
    };
}) satisfies PageServerLoad;