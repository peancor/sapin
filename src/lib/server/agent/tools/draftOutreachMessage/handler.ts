import { SafeActuationService } from '$lib/server/learning-evidence/SafeActuationService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentId: string;
	channel?: 'email' | 'in_app';
	tone?: 'supportive' | 'direct' | 'celebratory';
	objective?: string;
}

export async function draftOutreachMessage(
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
		const draft = await SafeActuationService.draftOutreachMessage(
			{ actorUserId: context.userId },
			{
				activityId,
				studentId: params.studentId,
				channel: params.channel,
				tone: params.tone,
				objective: params.objective
			}
		);

		return {
			success: true,
			data: draft,
			displayText: `Borrador de outreach listo para ${draft.student.username}.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al preparar el borrador de outreach',
			durationMs: Date.now() - start
		};
	}
}
