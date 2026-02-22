import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

import type { ChatSummaryStats, StudentData, StudentMetrics, RiskLevel, CompletionStatus, ActivityContext } from '$lib/types/insights';

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
        throw error(403, access.reason || 'No tienes permisos para ver los insights de esta actividad');
    }

    // Load the chat data for this interactive learning activity
    // bypassStatusCheck: true porque es una ruta admin
    const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(params.ilid, { bypassStatusCheck: true });

    if (!interactiveChat) throw error(404, 'Interactive chat not found');

    // Get course ID
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
        throw error(404, 'Course not found for this activity');
    }

    const courseId = courseInteractive[0].courseId;

    // Get chat statistics using our local function
    const chatStats = await getChatStatistics(interactiveChat.interactive_learning_chat.id);

    // Cargar modelos activos desde el nuevo sistema de gestion de modelos
    const availableModels = await AIUtils.getAvailableModels();
    const enabledModels = availableModels.map(m => m.name);

    // Obtener modelo por defecto del sistema
    const defaultModel = await AIUtils.getDefaultModel();

    // Get students with metrics
    const students = await getStudentsWithMetrics(
        interactiveChat.interactive_learning_chat.id,
        courseId
    );

    // Build activity context
    const activityContext: ActivityContext = {
        name: interactiveChat.interactive_learning.name,
        description: interactiveChat.interactive_learning.description,
        systemPrompt: interactiveChat.interactive_learning_chat.systemPrompt,
        llmRole: interactiveChat.interactive_learning_chat.llmRole,
        llmInstructions: interactiveChat.interactive_learning_chat.llmInstructions,
        llmContext: interactiveChat.interactive_learning_chat.llmContext
    };

    return {
        interactiveChat,
        chatStats,
        enabledModels,
        defaultModel,
        students,
        activityContext,
        courseId
    };
}) satisfies PageServerLoad;

// Funcion para obtener estadisticas basicas de los chats
async function getChatStatistics(interactiveLearningChatId: string): Promise<ChatSummaryStats> {
    const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
        interactiveLearningChatId,
        {},
        undefined,
        undefined
    );

    const totalChats = chatResults.totalCount;
    const totalMessages = chatResults.chats.reduce((sum, chat) => sum + chat.messages.length, 0);
    const averageMessagesPerChat = totalChats > 0 ? totalMessages / totalChats : 0;

    const uniqueStudentIds = new Set(chatResults.chats.map(chat => chat.user.id));

    return {
        totalChats,
        totalMessages,
        averageMessagesPerChat,
        uniqueStudentCount: uniqueStudentIds.size
    };
}

// Get students enrolled in the course with their metrics
async function getStudentsWithMetrics(
    interactiveLearningChatId: string,
    courseId: string
): Promise<StudentData[]> {
    // Get enrolled students
    const courseUsers = await CourseRoleUtils.getCourseUsers(courseId);
    const enrolledStudents = courseUsers.filter(u => u.role === 'student');

    // Get all chat instances
    const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
        interactiveLearningChatId,
        {},
        undefined,
        undefined
    );

    // Create map of chats by student
    const chatsByStudent = new Map<string, typeof chatResults.chats>();
    for (const chat of chatResults.chats) {
        const existing = chatsByStudent.get(chat.user.id) || [];
        existing.push(chat);
        chatsByStudent.set(chat.user.id, existing);
    }

    // Calculate metrics for each student
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

    // Sort by risk (high first) then by name
    students.sort((a, b) => {
        const riskOrder = { high: 0, medium: 1, low: 2 };
        const riskDiff = riskOrder[a.metrics.riskLevel] - riskOrder[b.metrics.riskLevel];
        if (riskDiff !== 0) return riskDiff;
        return a.username.localeCompare(b.username);
    });

    return students;
}

function calculateStudentMetrics(
    chats: Awaited<ReturnType<typeof DBChatUtils.getAllChatInstancesFromInteractiveId>>['chats']
): StudentMetrics {
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

    // Calculate student messages only
    const studentMessages = chats.flatMap(chat =>
        chat.messages.filter(msg => msg.type === 'USER')
    );
    const totalMessages = studentMessages.length;

    // Average message length
    const avgMessageLength = totalMessages > 0
        ? studentMessages.reduce((sum, msg) => sum + msg.content.length, 0) / totalMessages
        : 0;

    // Find last activity
    const allMessages = chats.flatMap(chat => chat.messages);
    const lastMessage = allMessages.reduce((latest, msg) => {
        const msgDate = new Date(msg.createdAt);
        return msgDate > new Date(latest.createdAt) ? msg : latest;
    }, allMessages[0]);
    const lastActivityAt = lastMessage?.createdAt ? new Date(lastMessage.createdAt).toISOString() : null;

    // Determine completion status
    let completionStatus: CompletionStatus = 'in_progress';
    if (totalMessages >= 5) {
        completionStatus = 'completed';
    } else if (totalMessages === 0) {
        completionStatus = 'not_started';
    }

    // Calculate engagement score (0-100)
    let engagementScore = 0;
    engagementScore += Math.min(totalMessages * 10, 40);
    engagementScore += Math.min(avgMessageLength / 10, 30);
    if (lastActivityAt) {
        const daysSinceActivity = (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
        engagementScore += Math.max(30 - daysSinceActivity * 5, 0);
    }
    engagementScore = Math.min(Math.round(engagementScore), 100);

    // Determine risk level
    let riskLevel: RiskLevel = 'low';
    if (engagementScore < 30 || totalMessages === 0) {
        riskLevel = 'high';
    } else if (engagementScore < 60 || totalMessages < 3) {
        riskLevel = 'medium';
    }

    // Check inactivity
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
