import { StaffAgentAnalyticsService } from '$lib/server/staff-agent';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentIds?: string[];
	dateFrom?: string;
	dateTo?: string;
}

export async function getActivityParticipants(
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
		const result = await StaffAgentAnalyticsService.getActivityParticipants(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Participacion lista: ${result.participantsCount} participante(s) y ${result.nonParticipantsCount} sin evidencia.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al calcular participantes de la actividad',
			durationMs: Date.now() - start
		};
	}
}
