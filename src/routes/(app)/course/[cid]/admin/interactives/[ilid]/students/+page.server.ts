import { error, redirect } from '@sveltejs/kit';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { and, eq, inArray, count } from 'drizzle-orm';
import { interactiveLearning, userInteractiveLearningChat, agentMessage, learningActivityProgress } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { ACTIVITY_COMPLETION_MIN_MESSAGES } from '$lib/constants';

type StudentDraftMetrics = {
    totalKeypresses: number;
    totalPastes: number;
    totalTimeSpentSeconds: number;
};

function emptyStudentDraftMetrics(): StudentDraftMetrics {
    return {
        totalKeypresses: 0,
        totalPastes: 0,
        totalTimeSpentSeconds: 0
    };
}

function parseDraftMetrics(metadata: string | null | undefined): StudentDraftMetrics {
    if (!metadata) {
        return emptyStudentDraftMetrics();
    }

    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;

        return {
            totalKeypresses: typeof parsed.keystrokeCount === 'number' ? parsed.keystrokeCount : 0,
            totalPastes: typeof parsed.pasteCount === 'number' ? parsed.pasteCount : 0,
            totalTimeSpentSeconds: typeof parsed.timeSpentSeconds === 'number' ? parsed.timeSpentSeconds : 0
        };
    } catch {
        return emptyStudentDraftMetrics();
    }
}

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

        const studentIds = enrolledStudents.map((student) => student.id);
        const chatIds = sessions.map(s => s.chatId);
        const messageCounts: Record<string, number> = {};
        const draftMetricsByChatId = new Map<string, StudentDraftMetrics>();
        const progressStatusByUser = new Map<string, string>();

        if (chatIds.length > 0) {
            const counts = await db
                .select({ chatId: agentMessage.chatId, messageCount: count(agentMessage.id) })
                .from(agentMessage)
                .where(inArray(agentMessage.chatId, chatIds))
                .groupBy(agentMessage.chatId);
            counts.forEach(c => { messageCounts[c.chatId] = c.messageCount; });

            const userMessageMetrics = await db
                .select({
                    chatId: agentMessage.chatId,
                    metadata: agentMessage.metadata
                })
                .from(agentMessage)
                .where(
                    and(
                        inArray(agentMessage.chatId, chatIds),
                        eq(agentMessage.role, 'user')
                    )
                );

            for (const message of userMessageMetrics) {
                const currentTotals = draftMetricsByChatId.get(message.chatId) ?? emptyStudentDraftMetrics();
                const messageMetrics = parseDraftMetrics(message.metadata);

                currentTotals.totalKeypresses += messageMetrics.totalKeypresses;
                currentTotals.totalPastes += messageMetrics.totalPastes;
                currentTotals.totalTimeSpentSeconds += messageMetrics.totalTimeSpentSeconds;

                draftMetricsByChatId.set(message.chatId, currentTotals);
            }
        }

        if (studentIds.length > 0) {
            const progressRows = await db
                .select({ userId: learningActivityProgress.userId, status: learningActivityProgress.status })
                .from(learningActivityProgress)
                .where(
                    and(
                        eq(learningActivityProgress.courseId, cid),
                        eq(learningActivityProgress.activityId, ilid),
                        inArray(learningActivityProgress.userId, studentIds)
                    )
                );

            for (const row of progressRows) {
                progressStatusByUser.set(row.userId, row.status);
            }
        }

        const studentsWithActivity = enrolledStudents.map(student => {
            const studentSessions = sessions.filter(s => s.userId === student.id);
            const totalMessages = studentSessions.reduce(
                (sum, s) => sum + (messageCounts[s.chatId] || 0), 0
            );
            const draftMetrics = studentSessions.reduce((totals, session) => {
                const sessionMetrics = draftMetricsByChatId.get(session.chatId);
                if (!sessionMetrics) return totals;

                totals.totalKeypresses += sessionMetrics.totalKeypresses;
                totals.totalPastes += sessionMetrics.totalPastes;
                totals.totalTimeSpentSeconds += sessionMetrics.totalTimeSpentSeconds;
                return totals;
            }, emptyStudentDraftMetrics());
            const hasActivity = studentSessions.length > 0;
            const progressStatus = progressStatusByUser.get(student.id);
            const isCompleted = progressStatus === 'completed';
            const lastActivity = studentSessions.length > 0
                ? new Date(Math.max(...studentSessions.map(s =>
                    s.createdAt instanceof Date ? s.createdAt.getTime() : new Date(s.createdAt).getTime()
                )))
                : null;

            return {
                ...student,
                chats: studentSessions.map(s => ({ chat: s, messages: [] })),
                hasActivity,
                isCompleted,
                inProgress: hasActivity && !isCompleted,
                lastActivity,
                totalMessages,
                totalKeypresses: draftMetrics.totalKeypresses,
                totalPastes: draftMetrics.totalPastes,
                totalTimeSpentSeconds: draftMetrics.totalTimeSpentSeconds,
                hasCompletionMarker: isCompleted
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
        const draftMetrics = studentChats.reduce((totals, chat) => {
            if (!chat.messages) return totals;

            for (const message of chat.messages) {
                const messageMetrics = parseDraftMetrics(message.metadata);
                totals.totalKeypresses += messageMetrics.totalKeypresses;
                totals.totalPastes += messageMetrics.totalPastes;
                totals.totalTimeSpentSeconds += messageMetrics.totalTimeSpentSeconds;
            }

            return totals;
        }, emptyStudentDraftMetrics());

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
            totalKeypresses: draftMetrics.totalKeypresses,
            totalPastes: draftMetrics.totalPastes,
            totalTimeSpentSeconds: draftMetrics.totalTimeSpentSeconds,
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
