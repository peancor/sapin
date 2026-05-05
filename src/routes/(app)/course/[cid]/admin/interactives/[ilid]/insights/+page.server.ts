import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { CourseInteractiveAuthUtils } from '$lib/server/db';
import type { ChatSummaryStats } from '$lib/types/insights';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import {
	toInsightsActivityContext,
	toInsightsStudentData
} from '$lib/server/learning-evidence/insights';

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
    const evidenceAccess = {
        actorUserId: locals.user.id,
        actorHighestRoleLevel: locals.user.highestRoleLevel
    };
    const overview = await LearningEvidenceService.getActivityEvidenceOverview(evidenceAccess, ilid);
    const courseId = overview.activity.courseId;

    if (!courseId) {
        throw error(404, 'Course not found for this activity');
    }

    const chatStats: ChatSummaryStats = {
        totalChats: overview.totalSessions,
        totalMessages: overview.totalMessages,
        averageMessagesPerChat:
            overview.totalSessions > 0 ? overview.totalMessages / overview.totalSessions : 0,
        uniqueStudentCount: overview.studentsWithEvidenceCount
    };

    // Cargar modelos activos desde el nuevo sistema de gestion de modelos
    const availableModels = await AIUtils.getAvailableModels();
    const enabledModels = availableModels.map(m => m.name);

    // Obtener modelo por defecto del sistema
    const defaultModel = await AIUtils.getDefaultModel();

    const students = toInsightsStudentData(overview);
    const activityContext = toInsightsActivityContext(overview);
    const interactiveChat = {
        interactive_learning: {
            id: overview.activity.activityId,
            name: overview.activity.name
        }
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
