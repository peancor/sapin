import { LearningEvidenceService } from '$lib/server/learning-evidence';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
}

export async function getActivityEvidenceOverview(
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
		const overview = await LearningEvidenceService.getActivityEvidenceOverview(
			{ actorUserId: context.userId },
			activityId,
			params.studentIds
		);

		return {
			success: true,
			data: overview,
			displayText: `Resumen listo: ${overview.totalSessions} sesion(es), ${overview.studentsWithEvidenceCount} estudiante(s) con evidencia.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage: error instanceof Error ? error.message : 'Error al obtener el resumen de evidencia',
			durationMs: Date.now() - start
		};
	}
}
