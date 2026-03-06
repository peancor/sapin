import { AdvancedInsightsService } from '$lib/server/learning-evidence/AdvancedInsightsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	includeMembers?: boolean;
}

export async function clusterInteractionPatterns(
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
		const result = await AdvancedInsightsService.clusterInteractionPatterns(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				includeMembers: params.includeMembers
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Patrones listos: ${result.clusters.length} grupo(s) detectados.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al agrupar patrones de interaccion',
			durationMs: Date.now() - start
		};
	}
}
