import { PedagogicalSupportService } from '$lib/server/learning-evidence/PedagogicalSupportService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	activityId?: string;
	studentId: string;
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	includeTranscriptExcerpts?: boolean;
}

export async function summarizeEvidenceForStudent(
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
		const summary = await PedagogicalSupportService.summarizeEvidenceForStudent(
			{ actorUserId: context.userId },
			{
				activityId,
				studentId: params.studentId,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				search: params.search,
				includeTranscriptExcerpts: params.includeTranscriptExcerpts
			}
		);

		return {
			success: true,
			data: summary,
			displayText: `Resumen individual listo para ${summary.student.username}.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al resumir la evidencia del estudiante',
			durationMs: Date.now() - start
		};
	}
}
