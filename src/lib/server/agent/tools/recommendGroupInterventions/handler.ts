import { TeacherActionQueueService } from '$lib/server/learning-evidence/TeacherActionQueueService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	courseId?: string;
	activityId?: string;
	studentIds?: string[];
	maxGroups?: number;
}

export async function recommendGroupInterventions(
	params: Params,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();
	const courseId = params.courseId ?? context.courseId;
	const activityId = params.activityId ?? context.activityId;

	if (!courseId && !activityId) {
		return {
			success: false,
			errorMessage: 'La herramienta requiere un courseId o un activityId en contexto.',
			durationMs: Date.now() - start
		};
	}

	try {
		const result = await TeacherActionQueueService.recommendGroupInterventions(
			{ actorUserId: context.userId },
			{
				courseId,
				activityId,
				studentIds: params.studentIds,
				maxGroups: params.maxGroups
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Agrupaciones listas: ${result.summary.totalGroups} grupo(s) sugeridos.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al recomendar intervenciones grupales',
			durationMs: Date.now() - start
		};
	}
}
