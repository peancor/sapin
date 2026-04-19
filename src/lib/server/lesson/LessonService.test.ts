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

test('parseDefinition requires explicit interaction and trigger configuration in agent blocks', () => {
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

	assert.throws(
		() => parseLessonDefinition(rawDefinition),
		(error) => error instanceof LessonServiceError
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
	assert.ok(introGroup?.outputs.some((variable) => variable.path === 'blocks.intro.outputs.visited'));
	assert.ok(choiceGroup?.outputs.some((variable) => variable.path === 'blocks.choice.outputs.route'));
	assert.ok(
		choiceGroup?.outputs.some((variable) => variable.path === 'blocks.choice.outputs.selectedLabel')
	);
	assert.ok(agentGroup?.state.some((variable) => variable.path === 'blocks.agent.state.lastVisitId'));
	assert.ok(agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.response'));
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.lastUserMessage')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.interactionMode')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.executionTrigger')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.autoStartOnEnter')
	);
	assert.ok(
		agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.hasUserResponse')
	);
	assert.ok(agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.mastery'));
	assert.ok(agentGroup?.outputs.some((variable) => variable.path === 'blocks.agent.outputs.rubric'));
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
					mode: 'single_choice',
					options: [
						{ id: 'a', label: 'A', value: 'a' },
						{ id: 'b', label: 'B', value: 'b' }
					],
					correctOptionIds: ['a']
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
	assert.ok(checkGroup?.outputs.some((variable) => variable.path === 'blocks.check.outputs.passed'));
	assert.ok(
		checkGroup?.outputs.some((variable) => variable.path === 'blocks.check.outputs.selectedOptionIds')
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
					mode: 'numeric',
					acceptedExact: 42,
					tolerance: 0
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
	assert.equal(checkBlock.checkConfig.mode, 'numeric');
	assert.equal(checkBlock.checkConfig.acceptedExact, 42);
});

test('evaluateCheckSubmission scores multiple choice and closes after exhaustion', () => {
	const block: LessonCheckBlock = {
		id: 'check',
		kind: 'check',
		title: 'Selección',
		body: 'Elige',
		next: 'end',
		checkConfig: normalizeLessonCheckConfig({
			mode: 'multiple_choice',
			maxAttempts: 2,
			options: [
				{ id: 'a', label: 'A', value: 'a' },
				{ id: 'b', label: 'B', value: 'b' },
				{ id: 'c', label: 'C', value: 'c' }
			],
			correctOptionIds: ['a', 'b']
		})
	};

	const firstResult = (
		LessonService as unknown as {
			evaluateCheckSubmission(input: {
				block: LessonCheckBlock;
				rawOptionIds?: string[];
				rawValue?: string | number;
				currentOutputs: Record<string, unknown>;
			}): { outputs: Record<string, unknown>; completed: boolean };
		}
	).evaluateCheckSubmission({
		block,
		rawOptionIds: ['a'],
		currentOutputs: {}
	});
	const secondResult = (
		LessonService as unknown as {
			evaluateCheckSubmission(input: {
				block: LessonCheckBlock;
				rawOptionIds?: string[];
				rawValue?: string | number;
				currentOutputs: Record<string, unknown>;
			}): { outputs: Record<string, unknown>; completed: boolean };
		}
	).evaluateCheckSubmission({
		block,
		rawOptionIds: ['c'],
		currentOutputs: firstResult.outputs
	});

	assert.equal(firstResult.completed, false);
	assert.equal(firstResult.outputs.attemptCount, 1);
	assert.equal(firstResult.outputs.passed, false);
	assert.equal(secondResult.completed, true);
	assert.equal(secondResult.outputs.attemptCount, 2);
	assert.equal(secondResult.outputs.attemptsRemaining, 0);
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
