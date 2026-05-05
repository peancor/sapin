import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { AIUtils } from '$lib/server/ai/AIUtils';
import {
	loadLessonStudioData,
	requireLessonStudioContext
} from '$lib/server/lesson/LessonStudioService';
import {
	applyValidationResults,
	checkGenerationRequestSchema,
	generationSchema,
	normalizeGeneratedQuestions,
	validationSchema,
	type GeneratedQuestion
} from '$lib/server/lesson/checkGeneration';
import {
	getLessonCheckModeLabel,
	type LessonCheckGenerationProposal,
	type LessonCheckGenerationRejection,
	type LessonCheckMode
} from '$lib/types/lesson';

const typeRules: Record<LessonCheckMode, string> = {
	single_choice:
		'Genera opciones discriminables con exactamente una respuesta correcta. Los distractores deben ser plausibles y no ambiguos.',
	multiple_choice:
		'La pregunta debe pedir seleccionar varias respuestas. Debe haber al menos dos opciones correctas y no pueden ser todas correctas.',
	true_false:
		'Usa solo afirmaciones declarativas verificables. No uses verdadero/falso para preguntas que requieran nombrar, explicar o redactar.',
	numeric:
		'Usa solo preguntas con respuesta cuantitativa clara. Devuelve acceptedExact o acceptedRange; usa tolerance si aplica.',
	short_text:
		'Usa respuestas de concepto, término, acción o explicación corta. Incluye variantes aceptadas razonables.'
};

function buildGenerationPrompt(input: {
	lessonName: string;
	blockTitle: string;
	blockBody?: string;
	objective: string;
	count: number;
	difficulty: string;
	targetMode: LessonCheckMode;
	graphSummary?: unknown;
	retryReasons?: string[];
}) {
	return [
		`Lesson: ${input.lessonName}`,
		`Bloque actual: ${input.blockTitle}`,
		input.blockBody?.trim() ? `Contenido del bloque:\n${input.blockBody.trim()}` : null,
		`Objetivo del docente:\n${input.objective}`,
		`Cantidad solicitada: ${input.count}`,
		`Dificultad: ${input.difficulty}`,
		`Tipo unico de esta tanda: ${input.targetMode} (${getLessonCheckModeLabel(input.targetMode)})`,
		`Regla del tipo:\n${typeRules[input.targetMode]}`,
		'Cada pregunta debe tener una respuesta correcta verificable desde el contenido, el objetivo o el contexto del bloque.',
		'No inventes respuestas correctas por descarte. Si el tipo no encaja, genera una pregunta distinta que si encaje con el tipo solicitado.',
		input.retryReasons?.length
			? `Errores que debes evitar en este reintento:\n${input.retryReasons.join('\n')}`
			: null,
		input.graphSummary
			? `Resumen de grafo y vecinos:\n${JSON.stringify(input.graphSummary, null, 2)}`
			: null
	]
		.filter(Boolean)
		.join('\n\n');
}

function buildValidationPrompt(input: {
	lessonName: string;
	blockTitle: string;
	blockBody?: string;
	objective: string;
	targetMode: LessonCheckMode;
	proposals: unknown[];
	graphSummary?: unknown;
}) {
	return [
		`Lesson: ${input.lessonName}`,
		`Bloque actual: ${input.blockTitle}`,
		input.blockBody?.trim() ? `Contenido del bloque:\n${input.blockBody.trim()}` : null,
		`Objetivo del docente:\n${input.objective}`,
		`Tipo unico de esta tanda: ${input.targetMode} (${getLessonCheckModeLabel(input.targetMode)})`,
		`Regla del tipo:\n${typeRules[input.targetMode]}`,
		input.graphSummary
			? `Resumen de grafo y vecinos:\n${JSON.stringify(input.graphSummary, null, 2)}`
			: null,
		`Propuestas a validar:\n${JSON.stringify(input.proposals, null, 2)}`,
		'Valida coherencia pedagogica, encaje del tipo, enunciado y respuesta correcta.',
		'Usa accepted si la propuesta es correcta, corrected si basta una correccion pequena, rejected si el tipo no encaja o la respuesta no se sostiene.',
		'No apruebes propuestas con respuesta correcta dudosa, distractores ambiguos o verdadero/falso usado para una respuesta abierta.'
	]
		.filter(Boolean)
		.join('\n\n');
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await requireLessonStudioContext(params.cid, params.ilid, locals);
		const payload = checkGenerationRequestSchema.parse(await request.json().catch(() => ({})));
		const targetMode = payload.allowedModes[0] as LessonCheckMode;
		const studio = await loadLessonStudioData(params.cid, params.ilid, locals);
		const block = studio.definition.blocks.find((candidate) => candidate.id === payload.blockId);
		if (!block || block.kind !== 'check') {
			throw error(404, 'Bloque de evaluación no encontrado');
		}

		const availableModels = await AIUtils.getAvailableModels();
		if (!availableModels.some((model) => model.name === payload.model)) {
			return json({ error: 'Modelo IA no disponible para este espacio.' }, { status: 400 });
		}

		const context = {
			userId: user.id,
			courseId: params.cid,
			interactiveLearningId: params.ilid
		};
		const graphSummary = studio.graphSummaries.find((summary) => summary.blockId === block.id);
		const usedQuestionIds = new Set<string>();
		const rejected: LessonCheckGenerationRejection[] = [];
		let proposals: LessonCheckGenerationProposal[] = [];

		for (let attempt = 0; attempt < 2 && proposals.length < payload.count; attempt += 1) {
			const missing = payload.count - proposals.length;
			const generated = await AIUtils.generateObjectFromMessages(
				[
					{
						role: 'system',
						content:
							'Eres un diseñador instruccional experto. Genera preguntas evaluables para authoring y devuelve solo datos estructurados acordes al schema. No uses progreso ni datos de alumnos.'
					},
					{
						role: 'user',
						content: buildGenerationPrompt({
							lessonName: studio.activity.name,
							blockTitle: block.title,
							blockBody: block.body,
							objective: payload.objective,
							count: missing,
							difficulty: payload.difficulty,
							targetMode,
							graphSummary,
							retryReasons:
								attempt === 0
									? undefined
									: rejected.slice(-6).map((item) => `- ${item.reason}`)
						})
					}
				],
				payload.model,
				generationSchema,
				context,
				{ temperature: 0.25 }
			);

			const normalized = normalizeGeneratedQuestions({
				rawQuestions: generated.questions as GeneratedQuestion[],
				targetMode,
				count: missing,
				usedQuestionIds
			});
			proposals = [...proposals, ...normalized.proposals].slice(0, payload.count);
			rejected.push(...normalized.rejected);
		}

		if (proposals.length === 0) {
			return json({ proposals: [], rejected });
		}

		const validation = await AIUtils.generateObjectFromMessages(
			[
				{
					role: 'system',
					content:
						'Eres un revisor pedagogico estricto. Valida propuestas de evaluacion para authoring. Devuelve solo datos estructurados acordes al schema.'
				},
				{
					role: 'user',
					content: buildValidationPrompt({
						lessonName: studio.activity.name,
						blockTitle: block.title,
						blockBody: block.body,
						objective: payload.objective,
						targetMode,
						graphSummary,
						proposals: proposals.map((proposal) => ({
							id: proposal.id,
							question: proposal.question,
							answerRationale: proposal.answerRationale,
							sourceRationale: proposal.sourceRationale
						}))
					})
				}
			],
			payload.model,
			validationSchema,
			context,
			{ temperature: 0.05 }
		);

		const validated = applyValidationResults({ proposals, validation, targetMode });
		return json({
			proposals: validated.proposals.slice(0, payload.count),
			rejected: [...rejected, ...validated.rejected]
		});
	} catch (err) {
		if (err instanceof z.ZodError) {
			return json({ error: 'Petición inválida', issues: err.issues }, { status: 400 });
		}
		throw err;
	}
};
