import { PedagogicalSupportService } from '$lib/server/learning-evidence/PedagogicalSupportService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentId: string;
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	maxActions?: number;
}

export async function draftRemediationPlan(
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
		const plan = await PedagogicalSupportService.draftRemediationPlan(
			{ actorUserId: context.userId },
			{
				activityId,
				studentId: params.studentId,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				search: params.search,
				maxActions: params.maxActions
			}
		);

		return {
			success: true,
			data: plan,
			displayText: `Plan de refuerzo listo para ${plan.student.username}.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al preparar el plan de refuerzo',
			durationMs: Date.now() - start
		};
	}
}
