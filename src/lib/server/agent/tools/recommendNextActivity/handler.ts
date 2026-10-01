import { PedagogicalSupportService } from '$lib/server/learning-evidence/PedagogicalSupportService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentId: string;
	preferPublishedOnly?: boolean;
}

export async function recommendNextActivity(
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

	if (!params.studentId) {
		return {
			success: false,
			errorMessage: 'La herramienta requiere un studentId.',
			durationMs: Date.now() - start
		};
	}

	try {
		const recommendation = await PedagogicalSupportService.recommendNextActivity(
			{ actorUserId: context.userId },
			{
				activityId,
				studentId: params.studentId,
				preferPublishedOnly: params.preferPublishedOnly
			}
		);

		return {
			success: true,
			data: recommendation,
			displayText: recommendation.recommendedActivity
				? `Siguiente recomendacion: ${recommendation.recommendedActivity.name}.`
				: 'No hay una siguiente actividad pendiente clara para recomendar.',
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al recomendar la siguiente actividad',
			durationMs: Date.now() - start
		};
	}
}
