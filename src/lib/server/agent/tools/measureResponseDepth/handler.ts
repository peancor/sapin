import { PedagogicalDiagnosticsService } from '$lib/server/learning-evidence/PedagogicalDiagnosticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	includeEvidenceExcerpts?: boolean;
}

export async function measureResponseDepth(
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
		const result = await PedagogicalDiagnosticsService.measureResponseDepth(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				includeEvidenceExcerpts: params.includeEvidenceExcerpts
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Profundidad lista: media ${result.summary.averageDepthScore} para ${result.summary.totalStudents} estudiante(s).`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al medir profundidad de respuesta',
			durationMs: Date.now() - start
		};
	}
}
