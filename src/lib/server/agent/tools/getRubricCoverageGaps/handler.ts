import { PedagogicalDiagnosticsService } from '$lib/server/learning-evidence/PedagogicalDiagnosticsService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface RubricCriterionInput {
	id?: string;
	title: string;
	description?: string;
	maxScore?: number;
	keywords?: string[];
}

interface Params {
	activityId?: string;
	studentIds?: string[];
	rubric: RubricCriterionInput[];
	includeEvidenceExcerpts?: boolean;
}

export async function getRubricCoverageGaps(
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
		const result = await PedagogicalDiagnosticsService.getRubricCoverageGaps(
			{ actorUserId: context.userId },
			{
				activityId,
				studentIds: params.studentIds,
				rubric: params.rubric,
				includeEvidenceExcerpts: params.includeEvidenceExcerpts
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Cobertura lista: ${result.summary.criteriaWithHighGap} criterio(s) con gap alto.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al analizar cobertura de rubrica',
			durationMs: Date.now() - start
		};
	}
}
