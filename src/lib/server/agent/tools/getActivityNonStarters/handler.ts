import { ActivityMicroAnalyticsService } from '$lib/server/learning-evidence/ActivityMicroAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	daysSincePublished?: number;
}

export async function getActivityNonStarters(
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
		const result = await ActivityMicroAnalyticsService.getActivityNonStarters(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				daysSincePublished: params.daysSincePublished
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Non-starters listos: ${result.summary.nonStarterCount} estudiante(s) sin arranque.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al detectar alumnado sin arranque',
			durationMs: Date.now() - start
		};
	}
}
