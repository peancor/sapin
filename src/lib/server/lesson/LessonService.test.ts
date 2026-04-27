import test from 'node:test';
import assert from 'node:assert/strict';

import type { LessonAgentBlock, LessonCheckBlock, LessonDefinition } from '../../types/lesson.ts';
import { normalizeLessonCheckConfig } from '../../types/lesson.ts';
import {
	getAvailableLessonReferenceGroups,
	getLessonBlockGraphSummary,
	parseLessonDefinition,
	validateLessonDefinition
} from './lessonGraph.ts';
import { LessonService } from './LessonService.ts';
import { LessonServiceError } from './LessonServiceError.ts';
import { AIUtils } from '../ai/AIUtils.ts';
import { isLessonPersistentAgentToolName } from './lessonAgentTools.ts';

function makeLinearDefinition(): LessonDefinition {
	return {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Bienvenida',
				next: 'end'
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Has terminado'
			}
		]
	};
}

test('parseDefinition normalizes lesson JSON to graph v2 while preserving block metadata', () => {
	const rawDefinition = JSON.stringify({
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Hola',
				next: 'end',
				graph: { position: { x: 120, y: 80 } }
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	});

	const definition = parseLessonDefinition(rawDefinition);

	assert.equal(definition.version, '2');
	assert.equal(definition.entryBlockId, 'intro');
	assert.deepEqual(definition.blocks[0]?.graph, { position: { x: 120, y: 80 } });
});

test('parseDefinition normalizes legacy agent blocks to the shared IA contract', () => {
	const rawDefinition = JSON.stringify({
		entryBlockId: 'agent',
		blocks: [
			{
				id: 'agent',
				kind: 'agent',
				title: 'Tutor',
				body: 'Dialoga',
				next: 'end',
				agentConfig: {
					promptTemplate: 'Acompana al estudiante'
				}
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	});

	const definition = parseLessonDefinition(rawDefinition);
	const agentBlock = definition.blocks[0];

	assert.equal(agentBlock?.kind, 'agent');
	if (agentBlock?.kind !== 'agent') {
		assert.fail('Expected normalized agent block');
	}
	assert.equal(agentBlock.agentConfig.runtimeMode, 'basic');
	assert.equal(agentBlock.agentConfig.interactionMode, 'single_turn');
	assert.equal(agentBlock.agentConfig.executionTrigger, 'on_user_submit');
	assert.equal(agentBlock.agentConfig.autoStartOnEnter, false);
});

test('parseDefinition normalizes YouTube URLs and exposes guided video outputs', () => {
	const definition = parseLessonDefinition(
		JSON.stringify({
			version: '2',
			entryBlockId: 'video',
			blocks: [
				{
					id: 'video',
					kind: 'youtube',
					title: 'Video guiado',
					videoId: 'https://youtu.be/M7lc1UVf-VE?si=abc',
					body: 'Mira este segmento',
					startSeconds: 3,
					endSeconds: 30,
					continueLabel: 'He terminado',
					pausePoints: [{ id: 'pause_1', seconds: 10, title: 'Reflexiona' }],
					next: 'end'
				},
				{
					id: 'end',
					kind: 'end',
					title: 'Fin',
					body: 'Cierre'
				}
			]
		})
	);
	const block = definition.blocks.find((candidate) => candidate.id === 'video');
	const groups = getAvailableLessonReferenceGroups(definition);
	const videoGroup = groups.byBlock.find((group) => group.blockId === 'video');

	assert.equal(block?.kind, 'youtube');
	assert.equal(block?.kind === 'youtube' ? block.videoId : undefined, 'M7lc1UVf-VE');
	assert.ok(
		videoGroup?.outputs.some((variable) => variable.path === 'blocks.video.outputs.completed')
	);
	assert.ok(
		videoGroup?.outputs.some((variable) => variable.path === 'blocks.video.outputs.watchPercent')
	);
	assert.ok(
		videoGroup?.outputs.some(
			(variable) => variable.path === 'blocks.video.outputs.reachedPausePointIds'
		)
	);
});

test('validateDefinition rejects invalid YouTube IDs, ranges and pause points', () => {
	const baseDefinition: LessonDefinition = {
		version: '2',
		entryBlockId: 'video',
		blocks: [
			{
				id: 'video',
				kind: 'youtube',
				title: 'Video guiado',
				videoId: 'M7lc1UVf-VE',
				startSeconds: 5,
				endSeconds: 20,
				pausePoints: [{ id: 'pause_1', seconds: 10 }],
				next: 'end'
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};

	assert.throws(
		() =>
			validateLessonDefinition({
				...baseDefinition,
				blocks: [
					{ ...baseDefinition.blocks[0], videoId: 'bad' } as LessonDefinition['blocks'][number],
					baseDefinition.blocks[1]
				]
			}),
		/ID de video válido/
	);
	assert.throws(
		() =>
			validateLessonDefinition({
				...baseDefinition,
				blocks: [
					{
						...baseDefinition.blocks[0],
						startSeconds: 20,
						endSeconds: 5
					} as LessonDefinition['blocks'][number],
					baseDefinition.blocks[1]
				]
			}),
		/final sea posterior/
	);
	assert.throws(
		() =>
			validateLessonDefinition({
				...baseDefinition,
				blocks: [
					{
						...baseDefinition.blocks[0],
						pausePoints: [{ id: 'pause_1', seconds: 25 }]
					} as LessonDefinition['blocks'][number],
					baseDefinition.blocks[1]
				]
			}),
		/fuera del segmento/
	);
	assert.throws(
		() =>
			validateLessonDefinition({
				...baseDefinition,
				blocks: [
					{ ...baseDefinition.blocks[0], next: null } as LessonDefinition['blocks'][number],
					baseDefinition.blocks[1]
				]
			}),
		/necesita un siguiente bloque/
	);
});

test('validateDefinition allows loops and graph summaries reflect incoming and outgoing edges', () => {
	const definition: LessonDefinition = {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Empieza aqui',
				next: 'hub'
			},
			{
				id: 'hub',
				kind: 'content',
				title: 'Hub',
				body: 'Puedes volver',
				next: 'intro',
				branches: [
					{
						label: 'Salir',
						targetBlockId: 'end',
						condition: {
							source: 'session.attemptNumber',
							operator: 'gte',
							value: 2
						}
					}
				]
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Terminado'
			}
		]
	};

	const validated = validateLessonDefinition(definition);
	const introSummary = getLessonBlockGraphSummary(validated, 'intro');
	const hubSummary = getLessonBlockGraphSummary(validated, 'hub');

	assert.deepEqual(introSummary.incomingBlockIds, ['hub']);
	assert.deepEqual(introSummary.outgoingBlockIds, ['hub']);
	assert.deepEqual(hubSummary.incomingBlockIds, ['intro']);
	assert.deepEqual(hubSummary.outgoingBlockIds, ['intro', 'end']);
});

test('validateDefinition stitches orphan linear blocks before the end node', () => {
	const definition: LessonDefinition = {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Empieza',
				next: 'end'
			},
			{
				id: 'content',
				kind: 'content',
				title: 'Paso 1',
				body: 'Primer bloque intermedio',
				next: 'end'
			},
			{
				id: 'content_1',
				kind: 'agent',
				title: 'Paso 2',
				body: 'Segundo bloque intermedio',
				next: 'end',
				agentConfig: {
					interactionMode: 'single_turn',
					executionTrigger: 'on_user_submit',
					autoStartOnEnter: false,
					promptTemplate: 'Continua'
				}
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};

	const validated = validateLessonDefinition(definition);
	const intro = validated.blocks.find((block) => block.id === 'intro');
	const firstIntermediate = validated.blocks.find((block) => block.id === 'content');
	const secondIntermediate = validated.blocks.find((block) => block.id === 'content_1');

	assert.equal(intro?.kind, 'content');
	assert.equal(intro?.next, 'content');
	assert.equal(firstIntermediate?.kind, 'content');
	assert.equal(firstIntermediate?.next, 'content_1');
	assert.equal(secondIntermediate?.kind, 'agent');
	assert.equal(secondIntermediate?.next, 'end');
});

test('authoring draft updates preserve disconnected blocks until publish validation', () => {
	const created = LessonService.createBlockDraft(makeLinearDefinition(), 'agent');
	const draftDefinition = structuredClone(created.definition);
	const draftAgent = draftDefinition.blocks.find((block) => block.id === created.block.id);

	assert.equal(draftAgent?.kind, 'agent');
	if (!draftAgent || draftAgent.kind !== 'agent') {
		throw new Error('Expected created block to be an agent block.');
	}

	draftAgent.next = null;

	assert.throws(
		() =>
			LessonService.updateBlock(draftDefinition, draftAgent.id, {
				...draftAgent,
				title: 'Tutor editado'
			}),
		(error) =>
			error instanceof LessonServiceError && error.message.includes('necesita un siguiente bloque')
	);

	const savedDraft = LessonService.updateBlockDraft(draftDefinition, draftAgent.id, {
		...draftAgent,
		title: 'Tutor editado'
	});
	const savedAgent = savedDraft.blocks.find((block) => block.id === draftAgent.id);

	assert.equal(savedAgent?.title, 'Tutor editado');
	assert.equal(savedAgent?.kind === 'agent' ? savedAgent.next : undefined, null);
});

test('authoring draft deletes blocks and clears their connections', () => {
	const definition: LessonDefinition = {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Bienvenida',
				next: 'agent'
			},
			{
				id: 'choice',
				kind: 'choice',
				title: 'Ruta',
				body: '',
				outputKey: 'route',
				options: [{ id: 'a', label: 'A', value: 'a', targetBlockId: 'agent' }]
			},
			{
				id: 'check',
				kind: 'check',
				title: 'Check',
				body: '',
				next: 'end',
				branches: [{ id: 'retry', label: 'Reintentar', targetBlockId: 'agent' }],
				checkConfig: normalizeLessonCheckConfig({
					questions: [
						{
							id: 'question_1',
							prompt: 'Respuesta',
							mode: 'short_text',
							acceptedAnswers: ['ok'],
							caseSensitive: false,
							trimWhitespace: true,
							matchMode: 'exact'
						}
					]
				})
			},
			{
				id: 'agent',
				kind: 'agent',
				title: 'Tutor',
				body: '',
				next: 'end',
				requiresResponse: true,
				agentConfig: {
					interactionMode: 'single_turn',
					executionTrigger: 'on_user_submit',
					autoStartOnEnter: false,
					promptTemplate: 'Acompaña'
				}
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};

	const draft = LessonService.deleteBlockDraft(definition, 'agent');
	const intro = draft.blocks.find((block) => block.id === 'intro');
	const choice = draft.blocks.find((block) => block.id === 'choice');
	const check = draft.blocks.find((block) => block.id === 'check');

	assert.equal(
		draft.blocks.some((block) => block.id === 'agent'),
		false
	);
	assert.equal(intro?.kind === 'content' ? intro.next : undefined, null);
	assert.equal(choice?.kind === 'choice' ? choice.options[0]?.targetBlockId : undefined, '');
	assert.deepEqual(check?.branches, []);
});

test('reference groups expose state and outputs for content, choice and agent blocks', () => {
	const definition: LessonDefinition = {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Abre la actividad',
				next: 'choice'
			},
			{
				id: 'choice',
				kind: 'choice',
				title: 'Ruta',
				body: 'Escoge camino',
				outputKey: 'route',
				options: [
					{ id: 'a', label: 'Analizar', value: 'analysis', targetBlockId: 'agent' },
					{ id: 'b', label: 'Salir', value: 'exit', targetBlockId: 'end' }
				]
			},
			{
				id: 'agent',
				kind: 'agent',
				title: 'Tutor IA',
				body: 'Dialoga',
				next: 'end',
				exposure: {
					outputs: [{ key: 'rubric', type: 'json', description: 'Rubrica publicada' }]
				},
				agentConfig: {
					interactionMode: 'single_turn',
					executionTrigger: 'on_user_submit',
					autoStartOnEnter: true,
					promptTemplate: 'Usa {{blocks.choice.outputs.route}} y {{session.currentVisitId}}',
					outputSchema: [{ key: 'mastery', type: 'number', description: 'Nivel de dominio' }]
				}
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};

	const groups = getAvailableLessonReferenceGroups(definition);
	const introGroup = groups.byBlock.find((group) => group.blockId === 'intro');
	const choiceGroup = groups.byBlock.find((group) => group.blockId === 'choice');
	const agentGroup = groups.byBlock.find((group) => group.blockId === 'agent');

	assert.ok(groups.session.some((variable) => variable.path === 'session.currentVisitId'));
	assert.ok(
		introGroup?.outputs.some((variable) => variable.path === 'blocks.intro.outputs.visited')
	);
	assert.ok(
		choiceGroup?.outputs.some((variable) => variable.path === 'blocks.choice.outputs.route')
	);
	assert.ok(
		choiceGroup?.outputs.some((variable) => variable.path === 'blocks.choice.outputs.selectedLabel')
	);
	assert.ok(
		agentGroup?.state.some((variable) => variable.path === 'blocks.agent.state.lastVisitId')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.response')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.lastUserMessage')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.interactionMode')
	);
	assert.ok(
		agentGroup?.outputs.some(
			(variable) => variable.path === 'blocks.agent.outputs.executionTrigger'
		)
	);
	assert.ok(
		agentGroup?.outputs.some(
			(variable) => variable.path === 'blocks.agent.outputs.autoStartOnEnter'
		)
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.hasUserResponse')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.mastery')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.rubric')
	);
});

test('reference groups expose evaluation outputs for check blocks', () => {
	const definition: LessonDefinition = {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Empieza',
				next: 'check'
			},
			{
				id: 'check',
				kind: 'check',
				title: 'Diagnóstico',
				body: 'Responde',
				next: 'end',
				checkConfig: normalizeLessonCheckConfig({
					questions: [
						{
							id: 'question_1',
							prompt: 'Elige',
							mode: 'single_choice',
							options: [
								{ id: 'a', label: 'A', value: 'a' },
								{ id: 'b', label: 'B', value: 'b' }
							],
							correctOptionIds: ['a']
						}
					]
				})
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Terminado'
			}
		]
	};

	const groups = getAvailableLessonReferenceGroups(definition);
	const checkGroup = groups.byBlock.find((group) => group.blockId === 'check');

	assert.ok(checkGroup?.outputs.some((variable) => variable.path === 'blocks.check.outputs.score'));
	assert.ok(
		checkGroup?.outputs.some((variable) => variable.path === 'blocks.check.outputs.passed')
	);
	assert.ok(
		checkGroup?.outputs.some((variable) => variable.path === 'blocks.check.outputs.questionResults')
	);
});

test('validateDefinition accepts check blocks with numeric rules', () => {
	const definition: LessonDefinition = {
		version: '2',
		entryBlockId: 'check',
		blocks: [
			{
				id: 'check',
				kind: 'check',
				title: 'Cálculo',
				body: 'Calcula',
				next: 'end',
				checkConfig: normalizeLessonCheckConfig({
					questions: [
						{
							id: 'question_1',
							prompt: 'Calcula',
							mode: 'numeric',
							acceptedExact: 42,
							tolerance: 0
						}
					]
				})
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};

	const validated = validateLessonDefinition(definition);
	const checkBlock = validated.blocks.find((block) => block.id === 'check');

	assert.equal(checkBlock?.kind, 'check');
	if (!checkBlock || checkBlock.kind !== 'check') {
		throw new Error('Expected check block');
	}
	assert.equal(checkBlock.checkConfig.questions[0]?.mode, 'numeric');
	assert.equal(
		checkBlock.checkConfig.questions[0]?.mode === 'numeric'
			? checkBlock.checkConfig.questions[0].acceptedExact
			: null,
		42
	);
});

test('evaluateCheckSubmission scores multiple choice and closes after exhaustion', () => {
	const block: LessonCheckBlock = {
		id: 'check',
		kind: 'check',
		title: 'Selección',
		body: 'Elige',
		next: 'end',
		checkConfig: normalizeLessonCheckConfig({
			maxAttempts: 2,
			questions: [
				{
					id: 'question_1',
					prompt: 'Elige',
					mode: 'multiple_choice',
					options: [
						{ id: 'a', label: 'A', value: 'a' },
						{ id: 'b', label: 'B', value: 'b' },
						{ id: 'c', label: 'C', value: 'c' }
					],
					correctOptionIds: ['a', 'b']
				}
			]
		})
	};

	const firstResult = (
		LessonService as unknown as {
			evaluateCheckSubmission(input: {
				block: LessonCheckBlock;
				answers: Array<{ questionId: string; optionIds?: string[]; value?: string | number }>;
				currentOutputs: Record<string, unknown>;
			}): { outputs: Record<string, unknown>; completed: boolean };
		}
	).evaluateCheckSubmission({
		block,
		answers: [{ questionId: 'question_1', optionIds: ['a'] }],
		currentOutputs: {}
	});
	const secondResult = (
		LessonService as unknown as {
			evaluateCheckSubmission(input: {
				block: LessonCheckBlock;
				answers: Array<{ questionId: string; optionIds?: string[]; value?: string | number }>;
				currentOutputs: Record<string, unknown>;
			}): { outputs: Record<string, unknown>; completed: boolean };
		}
	).evaluateCheckSubmission({
		block,
		answers: [{ questionId: 'question_1', optionIds: ['c'] }],
		currentOutputs: firstResult.outputs
	});

	assert.equal(firstResult.completed, false);
	assert.equal(firstResult.outputs.attemptCount, 1);
	assert.equal(firstResult.outputs.passed, false);
	assert.equal(secondResult.completed, true);
	assert.equal(secondResult.outputs.attemptCount, 2);
	assert.equal(secondResult.outputs.attemptsRemaining, 0);
});

test('evaluateCheckSubmission averages mixed question bank results', () => {
	const block: LessonCheckBlock = {
		id: 'check',
		kind: 'check',
		title: 'Banco mixto',
		body: 'Responde',
		next: 'end',
		checkConfig: normalizeLessonCheckConfig({
			passingScore: 0.8,
			questions: [
				{
					id: 'single',
					prompt: 'Única',
					mode: 'single_choice',
					options: [
						{ id: 'a', label: 'A', value: 'a' },
						{ id: 'b', label: 'B', value: 'b' }
					],
					correctOptionIds: ['a']
				},
				{
					id: 'multi',
					prompt: 'Múltiple',
					mode: 'multiple_choice',
					options: [
						{ id: 'a', label: 'A', value: 'a' },
						{ id: 'b', label: 'B', value: 'b' },
						{ id: 'c', label: 'C', value: 'c' }
					],
					correctOptionIds: ['a', 'b']
				},
				{
					id: 'bool',
					prompt: 'Verdadero',
					mode: 'true_false',
					options: [
						{ id: 'true', label: 'Verdadero', value: 'true' },
						{ id: 'false', label: 'Falso', value: 'false' }
					],
					correctOptionIds: ['true']
				},
				{
					id: 'num',
					prompt: 'Número',
					mode: 'numeric',
					acceptedExact: 42,
					tolerance: 0
				},
				{
					id: 'text',
					prompt: 'Texto',
					mode: 'short_text',
					acceptedAnswers: ['sapin'],
					caseSensitive: false,
					trimWhitespace: true,
					matchMode: 'exact'
				}
			]
		})
	};

	const result = (
		LessonService as unknown as {
			evaluateCheckSubmission(input: {
				block: LessonCheckBlock;
				answers: Array<{ questionId: string; optionIds?: string[]; value?: string | number }>;
				currentOutputs: Record<string, unknown>;
			}): { outputs: Record<string, unknown>; completed: boolean };
		}
	).evaluateCheckSubmission({
		block,
		answers: [
			{ questionId: 'single', optionIds: ['a'] },
			{ questionId: 'multi', optionIds: ['a'] },
			{ questionId: 'bool', optionIds: ['true'] },
			{ questionId: 'num', value: 42 },
			{ questionId: 'text', value: 'Sapin' }
		],
		currentOutputs: {}
	});

	assert.equal(result.outputs.totalQuestions, 5);
	assert.equal(result.outputs.correctCount, 4);
	assert.equal(result.outputs.score, 0.9);
	assert.equal(result.outputs.passed, true);
	assert.equal(result.outputs.isCorrect, false);
});

test('extractAgentOutputs preserves auto-start semantics without counting hidden launch messages', async () => {
	const block: LessonAgentBlock = {
		id: 'agent',
		kind: 'agent',
		title: 'Tutor',
		body: 'Dialoga',
		next: 'end',
		agentConfig: {
			interactionMode: 'single_turn',
			executionTrigger: 'on_user_submit',
			autoStartOnEnter: true,
			promptTemplate: 'Abre la conversación',
			maxTurns: null,
			model: null,
			systemPrompt: null,
			outputSchema: []
		}
	};

	const outputs = await (
		LessonService as unknown as {
			extractAgentOutputs(input: {
				block: LessonAgentBlock;
				modelName: string;
				assistantMessage: string;
				userMessage: string;
				messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
				currentOutputs: Record<string, unknown>;
				autoStarted: boolean;
				context: Record<string, unknown>;
			}): Promise<Record<string, unknown>>;
		}
	).extractAgentOutputs({
		block,
		modelName: 'mock-model',
		assistantMessage: 'Pregunta inicial',
		userMessage: '',
		messages: [
			{ role: 'system', content: 'Instrucciones' },
			{ role: 'assistant', content: 'Pregunta inicial' }
		],
		currentOutputs: {},
		autoStarted: true,
		context: {}
	});

	assert.equal(outputs.response, 'Pregunta inicial');
	assert.equal(outputs.lastUserMessage, '');
	assert.equal(outputs.hasUserResponse, false);
	assert.equal(outputs.userTurnCount, 0);
	assert.equal(outputs.assistantTurnCount, 1);
	assert.equal(outputs.autoStarted, true);
	assert.equal(outputs.autoStartOnEnter, true);
});

test('extractAgentOutputs counts UI responses as learner interaction in agent runtime', async () => {
	const block: LessonAgentBlock = {
		id: 'agent',
		kind: 'agent',
		title: 'Tutor',
		body: 'Lanza un quiz',
		next: 'end',
		agentConfig: {
			interactionMode: 'single_turn',
			executionTrigger: 'on_user_submit',
			autoStartOnEnter: true,
			promptTemplate: 'Evalua y sigue',
			maxTurns: null,
			model: null,
			systemPrompt: null,
			outputSchema: []
		}
	};

	const outputs = await (
		LessonService as unknown as {
			extractAgentOutputs(input: {
				block: LessonAgentBlock;
				modelName: string;
				assistantMessage: string;
				userMessage: string;
				messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
				conversationStats?: {
					userTurns: number;
					assistantTurns: number;
					uiResponseCount: number;
					userInteractionCount: number;
				};
				currentOutputs: Record<string, unknown>;
				autoStarted: boolean;
				context: Record<string, unknown>;
			}): Promise<Record<string, unknown>>;
		}
	).extractAgentOutputs({
		block,
		modelName: 'mock-model',
		assistantMessage: 'Quiz completado',
		userMessage: '',
		messages: [{ role: 'assistant', content: '[ui:QuizCard] {"userResponse":{"score":1}}' }],
		conversationStats: {
			userTurns: 0,
			assistantTurns: 1,
			uiResponseCount: 1,
			userInteractionCount: 1
		},
		currentOutputs: {},
		autoStarted: true,
		context: {}
	});

	assert.equal(outputs.hasUserResponse, true);
	assert.equal(outputs.userTurnCount, 0);
	assert.equal(outputs.uiResponseCount, 1);
	assert.equal(outputs.userInteractionCount, 1);
	assert.equal(outputs.assistantTurnCount, 1);
});

test('extractAgentOutputs validates structured outputs and records coercion audit', async () => {
	const block: LessonAgentBlock = {
		id: 'agent',
		kind: 'agent',
		title: 'Tutor',
		body: 'Evalua',
		next: 'end',
		agentConfig: {
			interactionMode: 'single_turn',
			executionTrigger: 'on_user_submit',
			autoStartOnEnter: false,
			promptTemplate: 'Extrae evidencia',
			maxTurns: null,
			model: null,
			systemPrompt: null,
			outputSchema: [
				{ key: 'mastery', type: 'number', description: 'Dominio' },
				{ key: 'passed', type: 'boolean', description: 'Superado' },
				{ key: 'feedback', type: 'string', description: 'Feedback' }
			]
		}
	};
	const aiUtilsForTest = AIUtils as unknown as {
		generateObjectFromMessages: (...args: unknown[]) => Promise<unknown>;
	};
	const original = aiUtilsForTest.generateObjectFromMessages;
	aiUtilsForTest.generateObjectFromMessages = async () => ({
		mastery: 0.75,
		passed: true,
		feedback: 42
	});

	try {
		const outputs = await (
			LessonService as unknown as {
				extractAgentOutputs(input: {
					block: LessonAgentBlock;
					modelName: string;
					assistantMessage: string;
					userMessage: string;
					messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
					currentOutputs: Record<string, unknown>;
					autoStarted: boolean;
					context: Record<string, unknown>;
				}): Promise<Record<string, unknown>>;
			}
		).extractAgentOutputs({
			block,
			modelName: 'mock-model',
			assistantMessage: 'Buen trabajo',
			userMessage: 'Mi respuesta',
			messages: [{ role: 'assistant', content: 'Buen trabajo' }],
			currentOutputs: {},
			autoStarted: false,
			context: {}
		});

		assert.equal(outputs.mastery, 0.75);
		assert.equal(outputs.passed, true);
		assert.equal(outputs.feedback, '42');
		assert.equal(outputs.extractionStatus, 'coerced');
		assert.deepEqual(outputs.extractionCoercedFields, ['feedback']);
	} finally {
		aiUtilsForTest.generateObjectFromMessages = original;
	}
});

test('extractAgentOutputs surfaces missing and failed structured output fields', async () => {
	const block: LessonAgentBlock = {
		id: 'agent',
		kind: 'agent',
		title: 'Tutor',
		body: 'Evalua',
		next: 'end',
		agentConfig: {
			interactionMode: 'single_turn',
			executionTrigger: 'on_user_submit',
			autoStartOnEnter: false,
			promptTemplate: 'Extrae evidencia',
			maxTurns: null,
			model: null,
			systemPrompt: null,
			outputSchema: [
				{ key: 'mastery', type: 'number', description: 'Dominio' },
				{ key: 'passed', type: 'boolean', description: 'Superado' }
			]
		}
	};
	const aiUtilsForTest = AIUtils as unknown as {
		generateObjectFromMessages: (...args: unknown[]) => Promise<unknown>;
	};
	const original = aiUtilsForTest.generateObjectFromMessages;
	aiUtilsForTest.generateObjectFromMessages = async () => ({
		mastery: 'not-a-number'
	});

	try {
		const outputs = await (
			LessonService as unknown as {
				extractAgentOutputs(input: {
					block: LessonAgentBlock;
					modelName: string;
					assistantMessage: string;
					userMessage: string;
					messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
					currentOutputs: Record<string, unknown>;
					autoStarted: boolean;
					context: Record<string, unknown>;
				}): Promise<Record<string, unknown>>;
			}
		).extractAgentOutputs({
			block,
			modelName: 'mock-model',
			assistantMessage: 'Sin evidencia suficiente',
			userMessage: 'No sé',
			messages: [{ role: 'assistant', content: 'Sin evidencia suficiente' }],
			currentOutputs: {},
			autoStarted: false,
			context: {}
		});

		assert.equal(outputs.extractionStatus, 'failed');
		assert.deepEqual(outputs.extractionMissingFields, ['passed']);
		assert.deepEqual(outputs.extractionFailedFields, ['mastery']);
	} finally {
		aiUtilsForTest.generateObjectFromMessages = original;
	}
});

test('lesson agent policy marks persistent tools for guarded execution', () => {
	assert.equal(isLessonPersistentAgentToolName('save_grade'), true);
	assert.equal(isLessonPersistentAgentToolName('send_notification'), true);
	assert.equal(isLessonPersistentAgentToolName('render_quiz'), false);
});

test('validateDefinition accepts future block references but rejects missing targets in templates', () => {
	const validFutureReference: LessonDefinition = {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Todavia no existe visita, pero si contrato: {{blocks.agent.outputs.response}}',
				next: 'agent'
			},
			{
				id: 'agent',
				kind: 'agent',
				title: 'Agente',
				body: 'Resuelve {{blocks.intro.outputs.completed}}',
				next: 'end',
				agentConfig: {
					interactionMode: 'single_turn',
					executionTrigger: 'on_user_submit',
					autoStartOnEnter: false,
					promptTemplate: 'Sesion {{session.currentVisitId}}'
				}
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Terminado'
			}
		]
	};

	assert.doesNotThrow(() => validateLessonDefinition(validFutureReference));

	const invalidReference: LessonDefinition = {
		...makeLinearDefinition(),
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Referencia rota {{blocks.missing.outputs.answer}}',
				next: 'end'
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};

	assert.throws(
		() => validateLessonDefinition(invalidReference),
		(error) =>
			error instanceof LessonServiceError &&
			error.message.includes('missing') &&
			error.message.includes('no existe')
	);
});

test('validateDefinition accepts auto start on enter for interactive agent blocks', () => {
	const validAgentDefinition: LessonDefinition = {
		version: '2',
		entryBlockId: 'agent',
		blocks: [
			{
				id: 'agent',
				kind: 'agent',
				title: 'Tutor',
				body: 'Dialoga',
				next: 'end',
				agentConfig: {
					interactionMode: 'multi_turn',
					executionTrigger: 'on_user_submit',
					autoStartOnEnter: true,
					promptTemplate: 'Abre la conversación y continúa con mini chat'
				}
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};

	assert.doesNotThrow(() => validateLessonDefinition(validAgentDefinition));
});

test('validateDefinition rejects on_enter as the primary trigger for interactive agent blocks', () => {
	const invalidAgentDefinition: LessonDefinition = {
		version: '2',
		entryBlockId: 'agent',
		blocks: [
			{
				id: 'agent',
				kind: 'agent',
				title: 'Tutor',
				body: 'Dialoga',
				next: 'end',
				agentConfig: {
					interactionMode: 'multi_turn',
					executionTrigger: 'on_enter',
					autoStartOnEnter: true,
					promptTemplate: 'No valido'
				}
			},
			{
				id: 'end',
				kind: 'end',
				title: 'Fin',
				body: 'Cierre'
			}
		]
	};

	assert.throws(
		() => validateLessonDefinition(invalidAgentDefinition),
		(error) =>
			error instanceof LessonServiceError &&
			error.message.includes('combinacion') &&
			error.message.includes('no soportada')
	);
});
