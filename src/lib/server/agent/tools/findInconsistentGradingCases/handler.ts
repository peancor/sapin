import { AdvancedInsightsService } from '$lib/server/learning-evidence/AdvancedInsightsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	scoreGapThreshold?: number;
	maxResults?: number;
}

export async function findInconsistentGradingCases(
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
		const result = await AdvancedInsightsService.findInconsistentGradingCases(
			{ actorUserId: context.userId },
			{
				activityId,
				scoreGapThreshold: params.scoreGapThreshold,
				maxResults: params.maxResults
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Se detectaron ${result.totalCases} caso(s) potenciales de inconsistencia.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al buscar inconsistencias de calificacion',
			durationMs: Date.now() - start
		};
	}
}
