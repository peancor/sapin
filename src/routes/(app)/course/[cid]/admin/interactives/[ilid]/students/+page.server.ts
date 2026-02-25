import { error, redirect } from '@sveltejs/kit';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { eq, inArray, count } from 'drizzle-orm';
import { interactiveLearning, userInteractiveLearningChat, agentMessage } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { ACTIVITY_COMPLETION_MIN_MESSAGES } from '$lib/constants';

export const load = (async ({ params, locals }) => {
    // Verificación de seguridad (defensa en profundidad)
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    const { cid, ilid } = params;
    const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
        locals.user.id, cid, ilid, locals.user.highestRoleLevel
    );

    if (!access.allowed) {
        throw error(403, access.reason || 'No tienes permisos para ver esta información');
    }

    // Verificar que el interactive learning existe y obtener su tipo
    const interactive = await db
        .select()
        .from(interactiveLearning)
        .where(eq(interactiveLearning.id, ilid))
        .get();

    if (!interactive) {
        throw error(404, 'Actividad no encontrada');
    }

    // Obtener todos los estudiantes inscritos en el curso usando CourseRoleUtils
    const courseUsers = await CourseRoleUtils.getCourseUsers(cid);
    const enrolledStudents = courseUsers
        .filter(u => u.role === 'student')
        .map(u => ({
            id: u.userId,
            visitorId: u.userId,
            username: u.username,
            email: u.email,
            image: u.image,
            alias: u.alias
        }));

    // === Actividad de tipo AGENT ===
    if (interactive.type === 'agent') {
        const sessions = await db
            .select()
            .from(userInteractiveLearningChat)
            .where(eq(userInteractiveLearningChat.interactiveLearningChatId, ilid));

        const chatIds = sessions.map(s => s.chatId);
        const messageCounts: Record<string, number> = {};
        if (chatIds.length > 0) {
            const counts = await db
                .select({ chatId: agentMessage.chatId, messageCount: count(agentMessage.id) })
                .from(agentMessage)
                .where(inArray(agentMessage.chatId, chatIds))
                .groupBy(agentMessage.chatId);
            counts.forEach(c => { messageCounts[c.chatId] = c.messageCount; });
        }

        const studentsWithActivity = enrolledStudents.map(student => {
            const studentSessions = sessions.filter(s => s.userId === student.id);
            const totalMessages = studentSessions.reduce(
                (sum, s) => sum + (messageCounts[s.chatId] || 0), 0
            );
            const hasActivity = studentSessions.length > 0;
            const lastActivity = studentSessions.length > 0
                ? new Date(Math.max(...studentSessions.map(s =>
                    s.createdAt instanceof Date ? s.createdAt.getTime() : new Date(s.createdAt).getTime()
                )))
                : null;

            return {
                ...student,
                chats: studentSessions.map(s => ({ chat: s, messages: [] })),
                hasActivity,
                isCompleted: false,
                inProgress: hasActivity,
                lastActivity,
                totalMessages,
                hasCompletionMarker: false
            };
        });

        return {
            interactive,
            interactiveChat: null,
            students: studentsWithActivity,
            requiresMinMessages: ACTIVITY_COMPLETION_MIN_MESSAGES
        };
    }

    // === Actividad de tipo CHAT (lógica existente) ===
    const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(ilid, { bypassStatusCheck: true });

    if (!interactiveChat) {
        throw error(404, 'Chat interactivo no encontrado');
    }

    // Obtener todas las instancias de chat para esta actividad interactiva
    const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
        interactiveChat.interactive_learning_chat.id,
        undefined,
        undefined,
        { page: 1, pageSize: 1000 } // Obtener todos los chats para analizar
    );

    // Mapear estudiantes con su actividad de chat
    const studentsWithActivity = enrolledStudents.map(student => {
        const studentChats = chatResults.chats.filter(chat => chat.chat.userId === student.id);

        // Calcular el total de mensajes enviados por el estudiante
        const totalMessages = studentChats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);

        // Comprobar si algún mensaje contiene [[DONE]]
        let hasCompletionMarker = false;
        studentChats.forEach(chat => {
            if (chat.messages) {
                for (const message of chat.messages) {
                    if (message.content.includes('[[DONE]]')) {
                        hasCompletionMarker = true;
                        break;
                    }
                }
            }
        });

        // Nueva lógica de estados:
        // 1. Si tiene más de 3 mensajes y uno contiene [[DONE]]: "Completado"
        // 2. Si tiene mensajes pero ninguno contiene [[DONE]]: "En Progreso"
        // 3. Sin mensajes: "Pendiente" (se maneja con hasActivity = false)
        const hasActivity = studentChats.length > 0;
        const isCompleted = totalMessages >= ACTIVITY_COMPLETION_MIN_MESSAGES && hasCompletionMarker;

        // Obtener la fecha de la última actividad
        const lastActivity = studentChats.length > 0
            ? new Date(Math.max(...studentChats.map(chat => new Date(chat.chat.createdAt).getTime())))
            : null;

        return {
            ...student,
            chats: studentChats,
            hasActivity,
            isCompleted,
            inProgress: hasActivity && !isCompleted,
            lastActivity,
            totalMessages,
            hasCompletionMarker
        };
    });

    return {
        interactive,
        interactiveChat,
        students: studentsWithActivity,
        requiresMinMessages: ACTIVITY_COMPLETION_MIN_MESSAGES
    };
}) satisfies PageServerLoad;