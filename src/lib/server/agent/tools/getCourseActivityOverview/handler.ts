import { StaffAgentAnalyticsService } from '$lib/server/staff-agent';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	courseId?: string;
	activityIds?: string[];
}

export async function getCourseActivityOverview(
	params: Params,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();
	const courseId = params.courseId ?? context.courseId;

	if (!courseId) {
		return {
			success: false,
			errorMessage: 'La herramienta requiere un courseId o un contexto de curso.',
			durationMs: Date.now() - start
		};
	}

	try {
		const result = await StaffAgentAnalyticsService.getCourseActivityOverview(
			{ actorUserId: context.userId },
			{
				courseId,
				activityIds: params.activityIds
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Resumen de curso listo: ${result.totalActivities} actividad(es) analizadas.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al resumir actividades del curso',
			durationMs: Date.now() - start
		};
	}
}
