import test from 'node:test';
import assert from 'node:assert/strict';

import {
	applyValidationResults,
	checkGenerationRequestSchema,
	generationSchema,
	normalizeGeneratedQuestions,
	type GeneratedQuestion
} from './checkGeneration.ts';

test('check generation request requires a single target mode', () => {
	const result = checkGenerationRequestSchema.safeParse({
		blockId: 'check',
		model: 'test-model',
		objective: 'Evaluar comprension',
		count: 3,
		difficulty: 'medium',
		allowedModes: ['single_choice', 'true_false']
	});

	assert.equal(result.success, false);
});

test('true/false generation does not default to true', () => {
	const batch = normalizeGeneratedQuestions({
		rawQuestions: [
			{
				prompt: 'La capital de Francia es Lyon.',
				mode: 'true_false',
				correctAnswer: false,
				answerRationale: 'La capital de Francia es Paris.',
				sourceRationale: 'El contenido menciona Paris como capital.'
			}
		],
		targetMode: 'true_false',
		count: 1
	});

	assert.equal(batch.rejected.length, 0);
	assert.equal(batch.proposals[0]?.question.mode, 'true_false');
	assert.deepEqual(
		batch.proposals[0]?.question.mode === 'true_false'
			? batch.proposals[0].question.correctOptionIds
			: [],
		['false']
	);
});

test('true/false schema rejects missing correctAnswer instead of defaulting', () => {
	const result = generationSchema.safeParse({
		questions: [
			{
				prompt: 'La capital de Francia es Paris.',
				mode: 'true_false',
				answerRationale: 'Paris es la capital.',
				sourceRationale: 'El contenido lo indica.'
			}
		]
	});

	assert.equal(result.success, false);
});

test('single choice without a marked correct option is rejected', () => {
	const rawQuestion: GeneratedQuestion = {
		prompt: 'Que accion es correcta?',
		mode: 'single_choice',
		options: [
			{ label: 'Accion A', isCorrect: false },
			{ label: 'Accion B', isCorrect: false }
		],
		answerRationale: 'Debe haber una accion correcta.',
		sourceRationale: 'El contenido explica la accion.'
	};

	const batch = normalizeGeneratedQuestions({
		rawQuestions: [rawQuestion],
		targetMode: 'single_choice',
		count: 1
	});

	assert.equal(batch.proposals.length, 0);
	assert.match(batch.rejected[0]?.reason ?? '', /exactamente una correcta/);
});

test('multiple choice with only one correct option is rejected', () => {
	const rawQuestion: GeneratedQuestion = {
		prompt: 'Selecciona las acciones correctas.',
		mode: 'multiple_choice',
		options: [
			{ label: 'Accion A', isCorrect: true },
			{ label: 'Accion B', isCorrect: false },
			{ label: 'Accion C', isCorrect: false }
		],
		answerRationale: 'Solo hay una correcta, asi que no es multiple.',
		sourceRationale: 'El contenido no sostiene varias correctas.'
	};

	const batch = normalizeGeneratedQuestions({
		rawQuestions: [rawQuestion],
		targetMode: 'multiple_choice',
		count: 1
	});

	assert.equal(batch.proposals.length, 0);
	assert.match(batch.rejected[0]?.reason ?? '', /al menos dos opciones correctas/);
});

test('accepted proposals keep runtime questions free of authoring metadata', () => {
	const batch = normalizeGeneratedQuestions({
		rawQuestions: [
			{
				prompt: 'Que concepto resume la unidad?',
				mode: 'short_text',
				acceptedAnswers: ['metacognicion', 'metacognicion aplicada'],
				answerRationale: 'El concepto central es metacognicion.',
				sourceRationale: 'El bloque lo presenta como eje.'
			}
		],
		targetMode: 'short_text',
		count: 1
	});
	const validated = applyValidationResults({
		proposals: batch.proposals,
		targetMode: 'short_text',
		validation: {
			results: [
				{
					id: batch.proposals[0]!.id,
					verdict: 'accepted',
					validationNotes: 'Coherente con el objetivo.',
					confidence: 0.92
				}
			]
		}
	});

	assert.equal(validated.proposals.length, 1);
	assert.deepEqual(Object.keys(validated.proposals[0]!.question).sort(), [
		'acceptedAnswers',
		'caseSensitive',
		'id',
		'matchMode',
		'mode',
		'prompt',
		'trimWhitespace'
	]);
	assert.equal(validated.proposals[0]?.confidence, 0.92);
});
