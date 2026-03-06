import { LearningEvidenceService } from '$lib/server/learning-evidence';
import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { LearningEvidenceMessageRole } from '$lib/types/learningEvidence';

interface Params {
	activityId?: string;
	studentIds?: string[];
	chatIds?: string[];
	search?: string;
	dateFrom?: string;
	dateTo?: string;
	includeRoles?: LearningEvidenceMessageRole[];
}

export async function getActivityTranscripts(
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
		const sessions = await LearningEvidenceService.getActivityTranscripts(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				chatIds: params.chatIds,
				search: params.search,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo,
				includeRoles: params.includeRoles
			}
		);

		return {
			success: true,
			data: {
				activityId,
				totalSessions: sessions.length,
				sessions
			},
			displayText: `Se recuperaron ${sessions.length} transcript(s) de actividad.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage: error instanceof Error ? error.message : 'Error al obtener los transcripts',
			durationMs: Date.now() - start
		};
	}
}
