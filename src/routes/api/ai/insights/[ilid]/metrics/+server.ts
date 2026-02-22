import type { RequestHandler } from '@sveltejs/kit';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { db, CourseRoleUtils } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
    ConsolidatedMetrics,
    StudentData,
    StudentAtRisk,
    RiskFactor,
    RiskLevel
} from '$lib/types/insights';

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
        const enrolledStudentIds = new Set(enrolledStudents.map(s => s.userId));

        // Obtener todas las conversaciones
        const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
            interactiveChat.interactive_learning_chat.id,
            {},
            undefined,
            undefined
        );

        // Filtrar solo chats de estudiantes enrolados
        const filteredChats = chatResults.chats.filter(chat => enrolledStudentIds.has(chat.user.id));

        // Calcular metricas consolidadas
        const metrics = calculateConsolidatedMetrics(filteredChats, enrolledStudents);

        return new Response(JSON.stringify(metrics), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error obteniendo metricas:', error);
        return new Response(
            'Error obteniendo metricas: ' + (error instanceof Error ? error.message : 'Error desconocido'),
            { status: 500 }
        );
    }
};

function calculateConsolidatedMetrics(
    chats: Awaited<ReturnType<typeof DBChatUtils.getAllChatInstancesFromInteractiveId>>['chats'],
    enrolledStudents: { userId: string; username: string | null; email: string; alias: string | null }[]
): ConsolidatedMetrics {
    const totalStudents = enrolledStudents.length;

    // Crear mapa de chats por estudiante
    const chatsByStudent = new Map<string, typeof chats>();
    for (const chat of chats) {
        const existing = chatsByStudent.get(chat.user.id) || [];
        existing.push(chat);
        chatsByStudent.set(chat.user.id, existing);
    }

    // Estudiantes que han participado
    const activeStudentIds = new Set(chats.map(c => c.user.id));
    const participationRate = totalStudents > 0 ? (activeStudentIds.size / totalStudents) * 100 : 0;

    // Calcular metricas por estudiante
    const studentMetrics: {
        id: string;
        username: string;
        email: string;
        messages: number;
        avgLength: number;
        lastActivity: Date | null;
        engagementScore: number;
        riskLevel: RiskLevel;
        riskFactors: RiskFactor[];
    }[] = [];

    for (const student of enrolledStudents) {
        const studentChats = chatsByStudent.get(student.userId) || [];
        const studentMessages = studentChats.flatMap(c => c.messages.filter(m => m.type === 'USER'));
        const messageCount = studentMessages.length;
        const avgLength = messageCount > 0
            ? studentMessages.reduce((sum, m) => sum + m.content.length, 0) / messageCount
            : 0;

        let lastActivity: Date | null = null;
        if (studentChats.length > 0) {
            const allMsgs = studentChats.flatMap(c => c.messages);
            if (allMsgs.length > 0) {
                lastActivity = allMsgs.reduce((latest, m) => {
                    const d = new Date(m.createdAt);
                    return d > latest ? d : latest;
                }, new Date(allMsgs[0].createdAt));
            }
        }

        // Calcular engagement score
        let engagementScore = 0;
        engagementScore += Math.min(messageCount * 10, 40);
        engagementScore += Math.min(avgLength / 10, 30);
        if (lastActivity) {
            const days = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
            engagementScore += Math.max(30 - days * 5, 0);
        }
        engagementScore = Math.min(Math.round(engagementScore), 100);

        // Determinar riesgo y factores
        const riskFactors: RiskFactor[] = [];
        let riskLevel: RiskLevel = 'low';

        if (messageCount === 0) {
            riskFactors.push({
                type: 'no_activity',
                description: 'Sin actividad registrada',
                severity: 'high'
            });
            riskLevel = 'high';
        } else {
            if (lastActivity) {
                const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSince > 7) {
                    riskFactors.push({
                        type: 'no_activity',
                        description: `Sin actividad hace ${Math.round(daysSince)} dias`,
                        severity: 'high'
                    });
                    riskLevel = 'high';
                } else if (daysSince > 3) {
                    riskFactors.push({
                        type: 'no_activity',
                        description: `Sin actividad hace ${Math.round(daysSince)} dias`,
                        severity: 'medium'
                    });
                    if (riskLevel === 'low') riskLevel = 'medium';
                }
            }

            if (engagementScore < 30) {
                riskFactors.push({
                    type: 'low_engagement',
                    description: `Engagement bajo (${engagementScore}%)`,
                    severity: 'high'
                });
                riskLevel = 'high';
            } else if (engagementScore < 60) {
                riskFactors.push({
                    type: 'low_engagement',
                    description: `Engagement moderado (${engagementScore}%)`,
                    severity: 'medium'
                });
                if (riskLevel === 'low') riskLevel = 'medium';
            }

            if (messageCount < 3) {
                riskFactors.push({
                    type: 'incomplete',
                    description: 'Actividad no completada',
                    severity: 'medium'
                });
                if (riskLevel === 'low') riskLevel = 'medium';
            }

            if (avgLength < 50 && messageCount > 0) {
                riskFactors.push({
                    type: 'short_messages',
                    description: 'Mensajes muy cortos',
                    severity: 'medium'
                });
                if (riskLevel === 'low') riskLevel = 'medium';
            }
        }

        studentMetrics.push({
            id: student.userId,
            username: student.username || 'Sin nombre',
            email: student.email,
            messages: messageCount,
            avgLength,
            lastActivity,
            engagementScore,
            riskLevel,
            riskFactors
        });
    }

    // Calcular metricas de engagement
    const activeStudents = studentMetrics.filter(s => s.messages > 0);
    const overallScore = activeStudents.length > 0
        ? Math.round(activeStudents.reduce((sum, s) => sum + s.engagementScore, 0) / activeStudents.length)
        : 0;

    // Calcular frecuencia de mensajes
    const totalMessages = chats.reduce((sum, c) => sum + c.messages.filter(m => m.type === 'USER').length, 0);
    const messageFrequency = activeStudents.length > 0 ? totalMessages / activeStudents.length : 0;

    // Estudiantes en riesgo
    const studentsAtRisk: StudentAtRisk[] = studentMetrics
        .filter(s => s.riskLevel === 'high' || s.riskLevel === 'medium')
        .map(s => ({
            student: {
                id: s.id,
                username: s.username,
                email: s.email,
                metrics: {
                    totalMessages: s.messages,
                    completionStatus: s.messages >= 5 ? 'completed' : s.messages > 0 ? 'in_progress' : 'not_started',
                    lastActivityAt: s.lastActivity?.toISOString() || null,
                    riskLevel: s.riskLevel,
                    engagementScore: s.engagementScore
                }
            },
            riskFactors: s.riskFactors,
            recommendedActions: generateRecommendedActions(s.riskFactors)
        }));

    // Distribucion de riesgo
    const riskDistribution = {
        high: studentMetrics.filter(s => s.riskLevel === 'high').length,
        medium: studentMetrics.filter(s => s.riskLevel === 'medium').length,
        low: studentMetrics.filter(s => s.riskLevel === 'low').length
    };

    // Distribucion de participacion
    const participation = {
        completed: studentMetrics.filter(s => s.messages >= 5).length,
        inProgress: studentMetrics.filter(s => s.messages > 0 && s.messages < 5).length,
        notStarted: studentMetrics.filter(s => s.messages === 0).length
    };

    // Top performers y struggling
    const sortedByEngagement = [...studentMetrics].sort((a, b) => b.engagementScore - a.engagementScore);
    const topPerformers = sortedByEngagement.slice(0, 3).map(s => s.username);
    const strugglingStudents = sortedByEngagement.slice(-3).filter(s => s.engagementScore < 50).map(s => s.username);

    return {
        engagement: {
            overallScore,
            participationRate: Math.round(participationRate),
            averageSessionDuration: 0, // No tenemos esta metrica disponible
            messageFrequency: Math.round(messageFrequency * 10) / 10,
            activeStudentsCount: activeStudentIds.size,
            inactiveStudentsCount: totalStudents - activeStudentIds.size
        },
        performance: {
            averageCompletionRate: Math.round((participation.completed / Math.max(totalStudents, 1)) * 100),
            averageMessageQuality: Math.round(
                activeStudents.length > 0
                    ? activeStudents.reduce((sum, s) => sum + s.avgLength, 0) / activeStudents.length
                    : 0
            ),
            topPerformers,
            strugglingStudents
        },
        earlyWarning: {
            studentsAtRisk,
            totalAtRisk: studentsAtRisk.length,
            riskDistribution
        },
        participation
    };
}

function generateRecommendedActions(riskFactors: RiskFactor[]): string[] {
    const actions: string[] = [];

    for (const factor of riskFactors) {
        switch (factor.type) {
            case 'no_activity':
                if (factor.severity === 'high') {
                    actions.push('Contactar via email urgente');
                    actions.push('Programar tutoria individual');
                } else {
                    actions.push('Enviar recordatorio amable');
                }
                break;
            case 'low_engagement':
                actions.push('Revisar si hay dificultades tecnicas');
                actions.push('Ofrecer recursos adicionales');
                break;
            case 'incomplete':
                actions.push('Verificar comprension del ejercicio');
                actions.push('Extender plazo si es necesario');
                break;
            case 'short_messages':
                actions.push('Sugerir respuestas mas elaboradas');
                actions.push('Proporcionar ejemplos de respuestas');
                break;
        }
    }

    // Eliminar duplicados
    return [...new Set(actions)];
}
