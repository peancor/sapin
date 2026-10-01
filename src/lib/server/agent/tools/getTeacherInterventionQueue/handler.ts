import { TeacherActionQueueService } from '$lib/server/learning-evidence/TeacherActionQueueService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	courseId?: string;
	activityId?: string;
	studentIds?: string[];
	maxResults?: number;
	minPriority?: 'low' | 'medium' | 'high';
}

export async function getTeacherInterventionQueue(
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
		const result = await TeacherActionQueueService.getTeacherInterventionQueue(
			{ actorUserId: context.userId },
			{
				courseId,
				activityId,
				studentIds: params.studentIds,
				maxResults: params.maxResults,
				minPriority: params.minPriority
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Cola lista: ${result.summary.queueLength} intervencion(es) priorizadas.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al construir la cola de intervencion',
			durationMs: Date.now() - start
		};
	}
}
