import { AdvancedInsightsService } from '$lib/server/learning-evidence/AdvancedInsightsService';
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
	studentId?: string;
	chatId?: string;
	responseText?: string;
	rubric: RubricCriterionInput[];
}

export async function rubricEvaluateResponse(
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
		const evaluation = await AdvancedInsightsService.rubricEvaluateResponse(
			{ actorUserId: context.userId },
			{
				activityId,
				studentId: params.studentId,
				chatId: params.chatId,
				responseText: params.responseText,
				rubric: params.rubric
			}
		);

		return {
			success: true,
			data: evaluation,
			displayText: `Evaluacion provisional lista: ${evaluation.scale.provisionalPercentage}% sobre la rubrica.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al evaluar la respuesta con rubrica',
			durationMs: Date.now() - start
		};
	}
}
