import { PedagogicalDiagnosticsService } from '$lib/server/learning-evidence/PedagogicalDiagnosticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	maxClusters?: number;
	includeEvidenceExcerpts?: boolean;
}

export async function detectActivityMisconceptions(
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
		const result = await PedagogicalDiagnosticsService.detectActivityMisconceptions(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				maxClusters: params.maxClusters,
				includeEvidenceExcerpts: params.includeEvidenceExcerpts
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Misconceptions listas: ${result.summary.totalClusters} cluster(es) detectados.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al detectar misconceptions de actividad',
			durationMs: Date.now() - start
		};
	}
}
