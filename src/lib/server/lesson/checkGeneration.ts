import { z } from 'zod';
import {
	createLessonCheckTrueFalseOptions,
	lessonCheckModes,
	type LessonCheckGenerationProposal,
	type LessonCheckGenerationRejection,
	type LessonCheckMode,
	type LessonCheckQuestion,
	type LessonCheckTextMatchMode
} from '$lib/types/lesson';

const difficultySchema = z.enum(['easy', 'medium', 'hard']);

export const checkGenerationRequestSchema = z.object({
	blockId: z.string().min(1),
	model: z.string().min(1),
	objective: z.string().trim().min(1).max(4000),
	count: z.number().int().min(1).max(12),
	difficulty: difficultySchema,
	allowedModes: z.array(z.enum(lessonCheckModes)).length(1)
});

const generationBaseSchema = z.object({
	prompt: z.string().min(1),
	answerRationale: z.string().min(1),
	sourceRationale: z.string().min(1)
});

const generatedChoiceOptionSchema = z.object({
	label: z.string().min(1),
	value: z.string().optional(),
	description: z.string().optional(),
	isCorrect: z.boolean()
});

const generatedSingleChoiceSchema = generationBaseSchema.extend({
	mode: z.literal('single_choice'),
	options: z.array(generatedChoiceOptionSchema).min(2).max(8)
});

const generatedMultipleChoiceSchema = generationBaseSchema.extend({
	mode: z.literal('multiple_choice'),
	options: z.array(generatedChoiceOptionSchema).min(3).max(8)
});

const generatedTrueFalseSchema = generationBaseSchema.extend({
	mode: z.literal('true_false'),
	correctAnswer: z.boolean()
});

const generatedNumericSchema = generationBaseSchema.extend({
	mode: z.literal('numeric'),
	acceptedExact: z.number().nullable().optional(),
	acceptedRange: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
	tolerance: z.number().min(0).nullable().optional()
});

const generatedShortTextSchema = generationBaseSchema.extend({
	mode: z.literal('short_text'),
	acceptedAnswers: z.array(z.string().min(1)).min(1),
	caseSensitive: z.boolean().optional(),
	trimWhitespace: z.boolean().optional(),
	matchMode: z.enum(['exact', 'contains', 'regex']).optional()
});

export const generatedQuestionSchema = z.discriminatedUnion('mode', [
	generatedSingleChoiceSchema,
	generatedMultipleChoiceSchema,
	generatedTrueFalseSchema,
	generatedNumericSchema,
	generatedShortTextSchema
]);

export const generationSchema = z.object({
	questions: z.array(generatedQuestionSchema).min(1)
});

export const validationSchema = z.object({
	results: z.array(
		z.object({
			id: z.string().min(1),
			verdict: z.enum(['accepted', 'corrected', 'rejected']),
			validationNotes: z.string().min(1),
			confidence: z.number().min(0).max(1).optional(),
			question: generatedQuestionSchema.optional(),
			answerRationale: z.string().optional(),
			sourceRationale: z.string().optional(),
			rejectionReason: z.string().optional()
		})
	)
});

export type CheckGenerationPayload = z.infer<typeof checkGenerationRequestSchema>;
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type GenerationResult = z.infer<typeof generationSchema>;
export type ValidationResult = z.infer<typeof validationSchema>;

export interface NormalizedGenerationBatch {
	proposals: LessonCheckGenerationProposal[];
	rejected: LessonCheckGenerationRejection[];
}

function makeId(prefix: string, index: number, usedIds: Set<string>) {
	let candidate = `${prefix}_${index + 1}`;
	let suffix = 2;
	while (usedIds.has(candidate)) {
		candidate = `${prefix}_${index + 1}_${suffix}`;
		suffix += 1;
	}
	usedIds.add(candidate);
	return candidate;
}

function cleanText(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}

function makeRejection(
	rawQuestion: Pick<GeneratedQuestion, 'prompt' | 'mode'>,
	reason: string
): LessonCheckGenerationRejection {
	return {
		prompt: rawQuestion.prompt?.trim() || undefined,
		mode: rawQuestion.mode,
		reason
	};
}

function normalizeGeneratedQuestion(
	rawQuestion: GeneratedQuestion,
	targetMode: LessonCheckMode,
	questionId: string
): LessonCheckGenerationProposal | LessonCheckGenerationRejection {
	if (rawQuestion.mode !== targetMode) {
		return makeRejection(
			rawQuestion,
			`La IA devolvió el tipo ${rawQuestion.mode}, pero la tanda era de tipo ${targetMode}.`
		);
	}

	const prompt = cleanText(rawQuestion.prompt);
	if (!prompt) {
		return makeRejection(rawQuestion, 'La pregunta no tiene enunciado.');
	}

	const answerRationale = rawQuestion.answerRationale.trim();
	const sourceRationale = rawQuestion.sourceRationale.trim();
	if (!answerRationale || !sourceRationale) {
		return makeRejection(rawQuestion, 'Falta la justificación de respuesta o de fuente.');
	}

	if (rawQuestion.mode === 'true_false') {
		const correctOptionId = rawQuestion.correctAnswer ? 'true' : 'false';
		return {
			id: questionId,
			question: {
				id: questionId,
				prompt,
				mode: 'true_false',
				options: createLessonCheckTrueFalseOptions(),
				correctOptionIds: [correctOptionId]
			},
			answerRationale,
			sourceRationale,
			validationNotes: 'Pendiente de validación IA.',
			confidence: 0
		};
	}

	if (rawQuestion.mode === 'single_choice' || rawQuestion.mode === 'multiple_choice') {
		const labels = new Set<string>();
		const options = rawQuestion.options
			.map((option, optionIndex) => ({
				id: `option_${optionIndex + 1}`,
				label: cleanText(option.label),
				value: option.value?.trim() || `option_${optionIndex + 1}`,
				description: option.description?.trim() || '',
				isCorrect: option.isCorrect
			}))
			.filter((option) => option.label);

		for (const option of options) {
			const normalizedLabel = option.label.toLocaleLowerCase();
			if (labels.has(normalizedLabel)) {
				return makeRejection(rawQuestion, 'Hay opciones duplicadas.');
			}
			labels.add(normalizedLabel);
		}

		const correctOptionIds = options
			.filter((option) => option.isCorrect)
			.map((option) => option.id);
		if (rawQuestion.mode === 'single_choice' && correctOptionIds.length !== 1) {
			return makeRejection(rawQuestion, 'Una pregunta de opción única necesita exactamente una correcta.');
		}
		if (rawQuestion.mode === 'multiple_choice') {
			if (correctOptionIds.length < 2) {
				return makeRejection(
					rawQuestion,
					'Una pregunta de respuesta múltiple necesita al menos dos opciones correctas.'
				);
			}
			if (correctOptionIds.length === options.length) {
				return makeRejection(rawQuestion, 'No puede marcar todas las opciones como correctas.');
			}
		}

		return {
			id: questionId,
			question: {
				id: questionId,
				prompt,
				mode: rawQuestion.mode,
				options: options.map(({ isCorrect: _isCorrect, ...option }) => option),
				correctOptionIds
			},
			answerRationale,
			sourceRationale,
			validationNotes: 'Pendiente de validación IA.',
			confidence: 0
		};
	}

	if (rawQuestion.mode === 'numeric') {
		const acceptedExact = rawQuestion.acceptedExact ?? null;
		const acceptedRange = rawQuestion.acceptedRange;
		const hasRange =
			acceptedRange !== undefined &&
			(acceptedRange.min !== undefined || acceptedRange.max !== undefined);
		if (acceptedExact === null && !hasRange) {
			return makeRejection(rawQuestion, 'Una pregunta numérica necesita valor exacto o rango.');
		}
		if (
			acceptedRange?.min !== undefined &&
			acceptedRange.max !== undefined &&
			acceptedRange.min > acceptedRange.max
		) {
			return makeRejection(rawQuestion, 'El rango numérico tiene min mayor que max.');
		}

		return {
			id: questionId,
			question: {
				id: questionId,
				prompt,
				mode: 'numeric',
				acceptedExact,
				acceptedRange,
				tolerance: rawQuestion.tolerance ?? null
			},
			answerRationale,
			sourceRationale,
			validationNotes: 'Pendiente de validación IA.',
			confidence: 0
		};
	}

	const acceptedAnswers = [
		...new Set(rawQuestion.acceptedAnswers.map((answer) => cleanText(answer)).filter(Boolean))
	];
	if (acceptedAnswers.length === 0) {
		return makeRejection(rawQuestion, 'Una pregunta de texto corto necesita respuestas aceptadas.');
	}

	return {
		id: questionId,
		question: {
			id: questionId,
			prompt,
			mode: 'short_text',
			acceptedAnswers,
			caseSensitive: rawQuestion.caseSensitive ?? false,
			trimWhitespace: rawQuestion.trimWhitespace ?? true,
			matchMode: (rawQuestion.matchMode ?? 'exact') as LessonCheckTextMatchMode
		},
		answerRationale,
		sourceRationale,
		validationNotes: 'Pendiente de validación IA.',
		confidence: 0
	};
}

export function normalizeGeneratedQuestions(input: {
	rawQuestions: GeneratedQuestion[];
	targetMode: LessonCheckMode;
	count: number;
	usedQuestionIds?: Set<string>;
}): NormalizedGenerationBatch {
	const usedQuestionIds = input.usedQuestionIds ?? new Set<string>();
	const proposals: LessonCheckGenerationProposal[] = [];
	const rejected: LessonCheckGenerationRejection[] = [];

	for (const rawQuestion of input.rawQuestions) {
		if (proposals.length >= input.count) break;
		const questionId = makeId('question', usedQuestionIds.size, usedQuestionIds);
		const normalized = normalizeGeneratedQuestion(rawQuestion, input.targetMode, questionId);
		if ('question' in normalized) {
			proposals.push(normalized);
		} else {
			rejected.push(normalized);
		}
	}

	return { proposals, rejected };
}

export function applyValidationResults(input: {
	proposals: LessonCheckGenerationProposal[];
	validation: ValidationResult;
	targetMode: LessonCheckMode;
}): NormalizedGenerationBatch {
	const proposalsById = new Map(input.proposals.map((proposal) => [proposal.id, proposal]));
	const validatedIds = new Set<string>();
	const accepted: LessonCheckGenerationProposal[] = [];
	const rejected: LessonCheckGenerationRejection[] = [];

	for (const result of input.validation.results) {
		const candidate = proposalsById.get(result.id);
		if (!candidate) continue;
		validatedIds.add(result.id);

		if (result.verdict === 'rejected') {
			rejected.push({
				prompt: candidate.question.prompt,
				mode: candidate.question.mode,
				reason: result.rejectionReason?.trim() || result.validationNotes
			});
			continue;
		}

		if (result.verdict === 'corrected' && !result.question) {
			rejected.push({
				prompt: candidate.question.prompt,
				mode: candidate.question.mode,
				reason: 'La validación pidió corregir la propuesta pero no devolvió una pregunta corregida.'
			});
			continue;
		}

		const normalizedCorrection = result.question
			? normalizeGeneratedQuestion(result.question, input.targetMode, candidate.id)
			: candidate;
		if (!('question' in normalizedCorrection)) {
			rejected.push(normalizedCorrection);
			continue;
		}

		accepted.push({
			...normalizedCorrection,
			answerRationale: result.answerRationale?.trim() || normalizedCorrection.answerRationale,
			sourceRationale: result.sourceRationale?.trim() || normalizedCorrection.sourceRationale,
			validationNotes: result.validationNotes,
			confidence: result.confidence ?? 0.7
		});
	}

	for (const proposal of input.proposals) {
		if (validatedIds.has(proposal.id)) continue;
		rejected.push({
			prompt: proposal.question.prompt,
			mode: proposal.question.mode,
			reason: 'La validación IA no devolvió un veredicto para esta propuesta.'
		});
	}

	return { proposals: accepted, rejected };
}

export function formatQuestionAnswer(question: LessonCheckQuestion): string {
	if (
		question.mode === 'single_choice' ||
		question.mode === 'multiple_choice' ||
		question.mode === 'true_false'
	) {
		const correctLabels = question.options
			.filter((option) => question.correctOptionIds.includes(option.id))
			.map((option) => option.label);
		return correctLabels.join(', ');
	}
	if (question.mode === 'numeric') {
		if (question.acceptedExact !== null) {
			return question.tolerance !== null
				? `${question.acceptedExact} ± ${question.tolerance}`
				: `${question.acceptedExact}`;
		}
		return [
			question.acceptedRange?.min !== undefined ? `min ${question.acceptedRange.min}` : null,
			question.acceptedRange?.max !== undefined ? `max ${question.acceptedRange.max}` : null
		]
			.filter(Boolean)
			.join(', ');
	}
	if (question.mode === 'short_text') {
		return question.acceptedAnswers.join(', ');
	}
	return '';
}
