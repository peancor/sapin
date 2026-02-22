import type { RequestHandler } from '@sveltejs/kit';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { db, CourseRoleUtils } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { StudentData, StudentMetrics, RiskLevel, CompletionStatus } from '$lib/types/insights';

export const GET: RequestHandler = async ({ params, locals }) => {
    try {
        const user = locals.user;
        if (!user) {
            return new Response('Usuario no autenticado', { status: 401 });
        }

        const ilid = params.ilid;
        if (!ilid) {
            return new Response('ID de actividad interactiva faltante', { status: 400 });
        }

        // Obtener datos de la actividad interactiva
        // bypassStatusCheck: true porque esta API es para admins/staff
        const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(ilid, { bypassStatusCheck: true });

        // Obtener el ID del curso
        const courseInteractive = await db
            .select()
            .from(table.courseInteractiveLearning)
            .where(
                eq(
                    table.courseInteractiveLearning.interactiveLearningId,
                    interactiveChat.interactive_learning_chat.id
                )
            )
            .limit(1);

        if (!courseInteractive[0]) {
            return new Response('No se encontro el curso asociado', { status: 404 });
        }

        const courseId = courseInteractive[0].courseId;

        // Obtener estudiantes del curso
        const courseUsers = await CourseRoleUtils.getCourseUsers(courseId);
        const enrolledStudents = courseUsers.filter(u => u.role === 'student');

        // Obtener todas las conversaciones
        const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
            interactiveChat.interactive_learning_chat.id,
            {},
            undefined,
            undefined
        );

        // Crear mapa de chats por estudiante
        const chatsByStudent = new Map<string, typeof chatResults.chats>();
        for (const chat of chatResults.chats) {
            const existing = chatsByStudent.get(chat.user.id) || [];
            existing.push(chat);
            chatsByStudent.set(chat.user.id, existing);
        }

        // Calcular metricas para cada estudiante
        const students: StudentData[] = enrolledStudents.map(student => {
            const studentChats = chatsByStudent.get(student.userId) || [];
            const metrics = calculateStudentMetrics(studentChats);

            return {
                id: student.userId,
                username: student.username || 'Sin nombre',
                email: student.email,
                alias: student.alias || undefined,
                metrics
            };
        });

        // Ordenar por riesgo (alto primero) y luego por nombre
        students.sort((a, b) => {
            const riskOrder = { high: 0, medium: 1, low: 2 };
            const riskDiff = riskOrder[a.metrics.riskLevel] - riskOrder[b.metrics.riskLevel];
            if (riskDiff !== 0) return riskDiff;
            return a.username.localeCompare(b.username);
        });

        return new Response(JSON.stringify(students), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error obteniendo estudiantes:', error);
        return new Response(
            'Error obteniendo estudiantes: ' + (error instanceof Error ? error.message : 'Error desconocido'),
            { status: 500 }
        );
    }
};

function calculateStudentMetrics(chats: Awaited<ReturnType<typeof DBChatUtils.getAllChatInstancesFromInteractiveId>>['chats']): StudentMetrics {
    if (chats.length === 0) {
        return {
            totalMessages: 0,
            completionStatus: 'not_started',
            lastActivityAt: null,
            riskLevel: 'high',
            engagementScore: 0,
            avgMessageLength: 0,
            responseCount: 0
        };
    }

    // Calcular mensajes totales (solo del estudiante, no del asistente)
    const studentMessages = chats.flatMap(chat =>
        chat.messages.filter(msg => msg.type === 'USER')
    );
    const totalMessages = studentMessages.length;

    // Calcular longitud promedio de mensajes
    const avgMessageLength = totalMessages > 0
        ? studentMessages.reduce((sum, msg) => sum + msg.content.length, 0) / totalMessages
        : 0;

    // Encontrar ultima actividad
    const allMessages = chats.flatMap(chat => chat.messages);
    const lastMessage = allMessages.reduce((latest, msg) => {
        const msgDate = new Date(msg.createdAt);
        return msgDate > new Date(latest.createdAt) ? msg : latest;
    }, allMessages[0]);
    const lastActivityAt = lastMessage?.createdAt ? new Date(lastMessage.createdAt).toISOString() : null;

    // Determinar estado de completitud
    let completionStatus: CompletionStatus = 'in_progress';
    if (totalMessages >= 5) {
        completionStatus = 'completed';
    } else if (totalMessages === 0) {
        completionStatus = 'not_started';
    }

    // Calcular score de engagement (0-100)
    let engagementScore = 0;
    engagementScore += Math.min(totalMessages * 10, 40); // Hasta 40 puntos por cantidad
    engagementScore += Math.min(avgMessageLength / 10, 30); // Hasta 30 puntos por longitud
    if (lastActivityAt) {
        const daysSinceActivity = (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
        engagementScore += Math.max(30 - daysSinceActivity * 5, 0); // Hasta 30 puntos por recencia
    }
    engagementScore = Math.min(Math.round(engagementScore), 100);

    // Determinar nivel de riesgo
    let riskLevel: RiskLevel = 'low';
    if (engagementScore < 30 || totalMessages === 0) {
        riskLevel = 'high';
    } else if (engagementScore < 60 || totalMessages < 3) {
        riskLevel = 'medium';
    }

    // Verificar inactividad
    if (lastActivityAt) {
        const daysSinceActivity = (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceActivity > 7) {
            riskLevel = 'high';
        } else if (daysSinceActivity > 3 && riskLevel === 'low') {
            riskLevel = 'medium';
        }
    }

    return {
        totalMessages,
        completionStatus,
        lastActivityAt,
        riskLevel,
        engagementScore,
        avgMessageLength: Math.round(avgMessageLength),
        responseCount: studentMessages.length
    };
}
