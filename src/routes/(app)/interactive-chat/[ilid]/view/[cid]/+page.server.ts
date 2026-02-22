import { error } from '@sveltejs/kit';
import { db, InteractiveChatAuthUtils } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import {
    message,
    user,
    chat,
    userInteractiveLearningChat,
    interactiveLearningChat,
    interactiveLearning
} from '$lib/server/db/schema';
import { ROLE_LEVELS } from '$lib/server/roles';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, locals }) => {
    const { cid, ilid } = params;
    const currentUser = locals.user;
    if (!currentUser) throw error(401, 'Not authenticated');

    // Verificar si el usuario es admin del sistema
    const isAdmin = currentUser.highestRoleLevel >= ROLE_LEVELS.ADMIN;

    // Si no es admin, verificar si puede ver todos los chats de ESTA actividad específica
    // (debe ser teacher/assistant/admin del curso donde está la actividad)
    if (!isAdmin) {
        const canViewAll = await InteractiveChatAuthUtils.userCanViewAllChats(
            currentUser.id, ilid, currentUser.highestRoleLevel
        );

        if (!canViewAll) {
            throw error(403, 'No autorizado: Solo profesores del curso y administradores pueden ver el historial de chats');
        }
    }

    // Cargar mensajes del chat
    const messages = await db
        .select()
        .from(message)
        .where(eq(message.chatId, cid))
        .orderBy(message.createdAt)
        .all();

    // Cargar información del chat
    const chatData = await db
        .select()
        .from(chat)
        .where(eq(chat.id, cid))
        .get();

    if (!chatData) {
        throw error(404, 'Chat not found');
    }

    // Cargar información del usuario (estudiante)
    const studentData = await db
        .select()
        .from(user)
        .where(eq(user.id, chatData.userId))
        .get();

    if (!studentData) {
        throw error(404, 'Student not found');
    }

    // Cargar información del chat interactivo
    const userILChat = await db
        .select()
        .from(userInteractiveLearningChat)
        .where(and(
            eq(userInteractiveLearningChat.chatId, cid),
            eq(userInteractiveLearningChat.userId, chatData.userId)
        ))
        .get();

    if (!userILChat) {
        throw error(404, 'Interactive learning chat relation not found');
    }

    // Cargar información de la actividad interactiva
    const ilChatData = await db
        .select()
        .from(interactiveLearningChat)
        .where(eq(interactiveLearningChat.id, userILChat.interactiveLearningChatId))
        .get();

    const ilData = await db
        .select()
        .from(interactiveLearning)
        .where(eq(interactiveLearning.id, ilid))
        .get();

    if (!ilData) {
        throw error(404, 'Interactive learning activity not found');
    }

    return {
        messages,
        chat: chatData,
        student: {
            id: studentData.id,
            username: studentData.username || 'Unknown',
            email: studentData.email,
            image: studentData.image
        },
        activity: {
            id: ilData.id,
            name: ilData.name,
            description: ilData.description,
            type: ilData.type,
            image: ilData.image
        },
        createdAt: chatData.createdAt,
        updatedAt: chatData.updatedAt
    };
}) satisfies PageServerLoad;