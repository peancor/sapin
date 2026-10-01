import { ActivityAnalyticsService } from '$lib/server/learning-evidence/ActivityAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	chatIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	bucket?: 'day' | 'week';
	limit?: number;
	includeStudentDetails?: boolean;
}

export async function getLearningProgressTimeline(
	params: Params,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();
	const activityId = params.activityId ?? context.activityId;

	if (!activityId) {
		return {
			success: false,
			errorMessage: 'La herramienta requiere un activityId o un contexto de actividad.',
			durationMs: Date.now() - start
		};
	}

	try {
		const timeline = await ActivityAnalyticsService.getLearningProgressTimeline(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				chatIds: params.chatIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				search: params.search,
				bucket: params.bucket,
				limit: params.limit,
				includeStudentDetails: params.includeStudentDetails
			}
		);

		return {
			success: true,
			data: timeline,
			displayText: `Timeline listo: ${timeline.points.length} punto(s) y ${timeline.totalStudents} estudiante(s) en alcance.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al obtener el timeline de progreso',
			durationMs: Date.now() - start
		};
	}
}
