import { ActivityAnalyticsService } from '$lib/server/learning-evidence/ActivityAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	chatIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	maxResults?: number;
	minScore?: number;
	minLearnerMessages?: number;
}

export async function findStuckSessions(
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
		const result = await ActivityAnalyticsService.findStuckSessions(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				chatIds: params.chatIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				search: params.search,
				maxResults: params.maxResults,
				minScore: params.minScore,
				minLearnerMessages: params.minLearnerMessages
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Se detectaron ${result.totalFlaggedSessions} sesion(es) con senales de atasco.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al detectar sesiones atascadas',
			durationMs: Date.now() - start
		};
	}
}
