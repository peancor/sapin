import { ActivityMicroAnalyticsService } from '$lib/server/learning-evidence/ActivityMicroAnalyticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentId: string;
	dateFrom?: string;
	dateTo?: string;
	includeEvidenceExcerpts?: boolean;
}

export async function getStudentAttemptHistory(
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
		const result = await ActivityMicroAnalyticsService.getStudentAttemptHistory(
			{ actorUserId: context.userId },
			{
				activityId,
				studentId: params.studentId,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				includeEvidenceExcerpts: params.includeEvidenceExcerpts
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Historial listo: ${result.items.length} intento(s) para ${result.student.username}.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al recuperar historial de intentos',
			durationMs: Date.now() - start
		};
	}
}
