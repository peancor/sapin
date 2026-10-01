import { ActivityMicroAnalyticsService } from '$lib/server/learning-evidence/ActivityMicroAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
}

export async function getActivityDropoutFunnel(
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
		const result = await ActivityMicroAnalyticsService.getActivityDropoutFunnel(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Embudo listo: completion ${result.summary.completedRate}% y abandono ${result.summary.abandonedRate}%.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al construir el embudo de abandono',
			durationMs: Date.now() - start
		};
	}
}
