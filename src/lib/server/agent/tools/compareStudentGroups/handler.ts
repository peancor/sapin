import { ActivityAnalyticsService } from '$lib/server/learning-evidence/ActivityAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	groupAStudentIds?: string[];
	groupBStudentIds?: string[];
	chatIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	labelA?: string;
	labelB?: string;
}

export async function compareStudentGroups(
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
		const comparison = await ActivityAnalyticsService.compareStudentGroups(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				groupAStudentIds: params.groupAStudentIds,
				groupBStudentIds: params.groupBStudentIds,
				chatIds: params.chatIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				search: params.search,
				labelA: params.labelA,
				labelB: params.labelB
			}
		);

		return {
			success: true,
			data: comparison,
			displayText: `Comparacion lista: ${comparison.groupA.stats.studentCount} estudiante(s) frente a ${comparison.groupB.stats.studentCount}.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al comparar grupos de estudiantes',
			durationMs: Date.now() - start
		};
	}
}
