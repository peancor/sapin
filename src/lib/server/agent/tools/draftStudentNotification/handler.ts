import { SafeActuationService } from '$lib/server/learning-evidence/SafeActuationService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentId: string;
	priority?: 'low' | 'normal' | 'high';
	purpose?: 'reminder' | 'encouragement' | 'follow_up';
	customFocus?: string;
}

export async function draftStudentNotification(
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
		const draft = await SafeActuationService.draftStudentNotification(
			{ actorUserId: context.userId },
			{
				activityId,
				studentId: params.studentId,
				priority: params.priority,
				purpose: params.purpose,
				customFocus: params.customFocus
			}
		);

		return {
			success: true,
			data: draft,
			displayText: `Borrador de notificacion listo para ${draft.student.username}.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al preparar el borrador de notificacion',
			durationMs: Date.now() - start
		};
	}
}
