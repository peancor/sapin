import { PedagogicalSupportService } from '$lib/server/learning-evidence/PedagogicalSupportService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentId: string;
	tone?: 'supportive' | 'direct' | 'celebratory';
	dateFrom?: string;
	dateTo?: string;
	search?: string;
}

export async function draftTeacherFeedback(
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
		const draft = await PedagogicalSupportService.draftTeacherFeedback(
			{ actorUserId: context.userId },
			{
				activityId,
				studentId: params.studentId,
				tone: params.tone,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				search: params.search
			}
		);

		return {
			success: true,
			data: draft,
			displayText: `Borrador de feedback listo para ${draft.student.username}.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al redactar feedback docente',
			durationMs: Date.now() - start
		};
	}
}
