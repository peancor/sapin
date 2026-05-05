import { AdvancedInsightsService } from '$lib/server/learning-evidence/AdvancedInsightsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	maxResults?: number;
	includeCompleted?: boolean;
}

export async function forecastCompletionRisk(
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
		const result = await AdvancedInsightsService.forecastCompletionRisk(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				maxResults: params.maxResults,
				includeCompleted: params.includeCompleted
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Pronostico listo para ${result.students.length} estudiante(s).`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al estimar riesgo de finalizacion',
			durationMs: Date.now() - start
		};
	}
}
