import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { AIUtils } from '$lib/server/ai/AIUtils';
import {
	loadLessonStudioData,
	requireLessonStudioContext
} from '$lib/server/lesson/LessonStudioService';
import {
	createLessonCheckTrueFalseOptions,
	lessonCheckModes,
	normalizeLessonCheckConfig,
	type LessonCheckMode,
	type LessonCheckQuestion
} from '$lib/types/lesson';

const requestSchema = z.object({
	blockId: z.string().min(1),
	model: z.string().min(1),
	objective: z.string().trim().min(1).max(4000),
	count: z.number().int().min(1).max(12),
	difficulty: z.enum(['easy', 'medium', 'hard']),
	allowedModes: z.array(z.enum(lessonCheckModes)).min(1)
});

const generatedQuestionSchema = z.object({
	prompt: z.string().min(1),
	mode: z.enum(lessonCheckModes),
	options: z
		.array(
			z.object({
				id: z.string().optional(),
				label: z.string().min(1),
				value: z.string().optional(),
				description: z.string().optional()
			})
		)
		.optional(),
	correctOptionIds: z.array(z.string()).optional(),
	acceptedExact: z.number().nullable().optional(),
	acceptedRange: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
	tolerance: z.number().min(0).nullable().optional(),
	acceptedAnswers: z.array(z.string()).optional(),
	caseSensitive: z.boolean().optional(),
	trimWhitespace: z.boolean().optional(),
	matchMode: z.enum(['exact', 'contains', 'regex']).optional()
});

const generationSchema = z.object({
	questions: z.array(generatedQuestionSchema).min(1)
});

type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

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

function sanitizeGeneratedQuestions(
	rawQuestions: GeneratedQuestion[],
	allowedModes: LessonCheckMode[],
	count: number
): LessonCheckQuestion[] {
	const usedQuestionIds = new Set<string>();
	const fallbackMode = allowedModes[0] ?? 'single_choice';

	return rawQuestions.slice(0, count).map((rawQuestion, questionIndex) => {
		const mode = allowedModes.includes(rawQuestion.mode) ? rawQuestion.mode : fallbackMode;
		const id = makeId('question', questionIndex, usedQuestionIds);
		const prompt = rawQuestion.prompt.trim();

		if (mode === 'true_false') {
			const correct = rawQuestion.correctOptionIds?.[0] === 'false' ? 'false' : 'true';
			return {
				id,
				prompt,
				mode,
				options: createLessonCheckTrueFalseOptions(),
				correctOptionIds: [correct]
			};
		}

		if (mode === 'single_choice' || mode === 'multiple_choice') {
			const usedOptionIds = new Set<string>();
			const options = (rawQuestion.options ?? [])
				.filter((option) => option.label.trim())
				.slice(0, 8)
				.map((option, optionIndex) => {
					const optionId = option.id?.trim() || makeId('option', optionIndex, usedOptionIds);
					usedOptionIds.add(optionId);
					return {
						id: optionId,
						label: option.label.trim(),
						value: option.value?.trim() || optionId,
						description: option.description?.trim() || ''
					};
				});
			const safeOptions =
				options.length >= 2
					? options
					: [
							{ id: 'option_1', label: 'Opción 1', value: 'option_1', description: '' },
							{ id: 'option_2', label: 'Opción 2', value: 'option_2', description: '' }
						];
			const validOptionIds = new Set(safeOptions.map((option) => option.id));
			const correctOptionIds = (rawQuestion.correctOptionIds ?? []).filter((optionId) =>
				validOptionIds.has(optionId)
			);
			return {
				id,
				prompt,
				mode,
				options: safeOptions,
				correctOptionIds:
					mode === 'multiple_choice'
						? correctOptionIds.length > 0
							? correctOptionIds
							: [safeOptions[0]!.id]
						: [correctOptionIds[0] ?? safeOptions[0]!.id]
			};
		}

		if (mode === 'numeric') {
			return {
				id,
				prompt,
				mode,
				acceptedExact: rawQuestion.acceptedExact ?? null,
				acceptedRange: rawQuestion.acceptedRange,
				tolerance: rawQuestion.tolerance ?? null
			};
		}

		return {
			id,
			prompt,
			mode: 'short_text',
			acceptedAnswers: (rawQuestion.acceptedAnswers ?? []).filter((answer) => answer.trim()),
			caseSensitive: rawQuestion.caseSensitive ?? false,
			trimWhitespace: rawQuestion.trimWhitespace ?? true,
			matchMode: rawQuestion.matchMode ?? 'exact'
		};
	});
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await requireLessonStudioContext(params.cid, params.ilid, locals);
		const payload = requestSchema.parse(await request.json().catch(() => ({})));
		const studio = await loadLessonStudioData(params.cid, params.ilid, locals);
		const block = studio.definition.blocks.find((candidate) => candidate.id === payload.blockId);
		if (!block || block.kind !== 'check') {
			throw error(404, 'Bloque de evaluación no encontrado');
		}

		const availableModels = await AIUtils.getAvailableModels();
		if (!availableModels.some((model) => model.name === payload.model)) {
			return json({ error: 'Modelo IA no disponible para este espacio.' }, { status: 400 });
		}

		const graphSummary = studio.graphSummaries.find((summary) => summary.blockId === block.id);
		const generated = await AIUtils.generateObjectFromMessages(
			[
				{
					role: 'system',
					content:
						'Eres un diseñador instruccional. Genera preguntas evaluables para authoring. Devuelve solo datos estructurados acordes al schema. No uses progreso ni datos de alumnos.'
				},
				{
					role: 'user',
					content: [
						`Lesson: ${studio.activity.name}`,
						`Bloque actual: ${block.title}`,
						block.body?.trim() ? `Contenido del bloque:\n${block.body.trim()}` : null,
						`Objetivo del docente:\n${payload.objective}`,
						`Cantidad: ${payload.count}`,
						`Dificultad: ${payload.difficulty}`,
						`Tipos permitidos: ${payload.allowedModes.join(', ')}`,
						graphSummary
							? `Resumen de grafo y vecinos:\n${JSON.stringify(graphSummary, null, 2)}`
							: null
					]
						.filter(Boolean)
						.join('\n\n')
				}
			],
			payload.model,
			generationSchema,
			{
				userId: user.id,
				courseId: params.cid,
				interactiveLearningId: params.ilid
			},
			{ temperature: 0.35 }
		);

		const questions = normalizeLessonCheckConfig({
			questions: sanitizeGeneratedQuestions(generated.questions, payload.allowedModes, payload.count)
		}).questions.filter((question) => {
			if (
				question.mode === 'single_choice' ||
				question.mode === 'multiple_choice' ||
				question.mode === 'true_false'
			) {
				return question.options.length > 0 && question.correctOptionIds.length > 0;
			}
			if (question.mode === 'numeric') {
				return question.acceptedExact !== null || question.acceptedRange !== undefined;
			}
			return question.mode === 'short_text' && question.acceptedAnswers.length > 0;
		});

		return json({ questions });
	} catch (err) {
		if (err instanceof z.ZodError) {
			return json({ error: 'Petición inválida', issues: err.issues }, { status: 400 });
		}
		throw err;
	}
};
