import { ActivityAnalyticsService } from '$lib/server/learning-evidence/ActivityAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	chatIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	limit?: number;
}

export async function getActivityToolUsageSummary(
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
		const summary = await ActivityAnalyticsService.getActivityToolUsageSummary(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				chatIds: params.chatIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				search: params.search,
				limit: params.limit
			}
		);

		return {
			success: true,
			data: summary,
			displayText: `Uso de herramientas listo: ${summary.totalToolCalls} llamada(s) y ${summary.totalUIResponses} respuesta(s) UI.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al resumir el uso de herramientas',
			durationMs: Date.now() - start
		};
	}
}
