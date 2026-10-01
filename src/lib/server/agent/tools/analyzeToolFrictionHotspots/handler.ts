import { ActivityMicroAnalyticsService } from '$lib/server/learning-evidence/ActivityMicroAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	toolNames?: string[];
	maxResults?: number;
	includeEvidenceExcerpts?: boolean;
}

export async function analyzeToolFrictionHotspots(
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
		const result = await ActivityMicroAnalyticsService.analyzeToolFrictionHotspots(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				toolNames: params.toolNames,
				maxResults: params.maxResults,
				includeEvidenceExcerpts: params.includeEvidenceExcerpts
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Hotspots listos: ${result.items.length} foco(s) de friccion detectados.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al analizar hotspots de friccion',
			durationMs: Date.now() - start
		};
	}
}
