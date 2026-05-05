import { ActivityAnalyticsService } from '$lib/server/learning-evidence/ActivityAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	chatIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	maxSignals?: number;
}

export async function analyzeActivityDifficulty(
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
		const analysis = await ActivityAnalyticsService.analyzeActivityDifficulty(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				chatIds: params.chatIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				search: params.search,
				maxSignals: params.maxSignals
			}
		);

		return {
			success: true,
			data: analysis,
			displayText: `Analisis listo: ${analysis.difficultySignals.length} senal(es) de dificultad detectadas.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al analizar la dificultad de la actividad',
			durationMs: Date.now() - start
		};
	}
}
