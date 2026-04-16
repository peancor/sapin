import { z } from 'zod';

import type {
	LessonAgentBlock,
	LessonAvailableVariable,
	LessonBlock,
	LessonBlockContract,
	LessonBlockContractField,
	LessonBlockGraphSummary,
	LessonBlockKind,
	LessonBlockReferenceGroups,
	LessonConditionOperator,
	LessonDefinition,
	LessonOutputField
} from '../../types/lesson.ts';
import { LessonServiceError } from './LessonServiceError.ts';

export interface LessonReferenceGroups {
	session: LessonAvailableVariable[];
	state: LessonAvailableVariable[];
	outputs: LessonAvailableVariable[];
	byBlock: LessonBlockReferenceGroups[];
}

interface LessonDefinitionInput extends Omit<LessonDefinition, 'version'> {
	version?: '1' | '2';
}

const lessonTransitionSchema = z.object({
	id: z.string().optional(),
	label: z.string().optional(),
	targetBlockId: z.string().min(1),
	condition: z
		.object({
			source: z.string().min(1),
			operator: z.enum([
				'equals',
				'not_equals',
				'contains',
				'exists',
				'not_exists',
				'gt',
				'gte',
				'lt',
				'lte'
			]),
			value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
		})
		.optional()
});

const lessonOutputFieldSchema = z.object({
	key: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/),
	type: z.enum(['string', 'number', 'boolean', 'json']),
	description: z.string().optional()
});

const lessonBlockGraphMetaSchema = z.object({
	position: z
		.object({
			x: z.number(),
			y: z.number()
		})
		.optional()
});

const lessonBlockExposureSchema = z.object({
	outputs: z.array(lessonOutputFieldSchema).optional()
});

const lessonAssetRefSchema = z.object({
	fileId: z.string().min(1),
	kind: z.enum(['image', 'video', 'audio', 'file']).optional(),
	caption: z.string().optional()
});

const lessonChoiceOptionSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	value: z.string(),
	description: z.string().optional(),
	targetBlockId: z.string().min(1)
});

const lessonAgentConfigSchema = z.object({
	mode: z.enum(['guided_turn', 'mini_chat']),
	model: z.string().nullable().optional(),
	systemPrompt: z.string().nullable().optional(),
	promptTemplate: z.string(),
	placeholder: z.string().optional(),
	submitLabel: z.string().optional(),
	continueLabel: z.string().optional(),
	initialAssistantMessage: z.string().optional(),
	maxTurns: z.number().int().positive().nullable().optional(),
	outputSchema: z.array(lessonOutputFieldSchema).optional()
});

const lessonBlockBaseSchema = {
	id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
	title: z.string().min(1),
	next: z.string().nullable().optional(),
	branches: z.array(lessonTransitionSchema).optional(),
	graph: lessonBlockGraphMetaSchema.optional(),
	exposure: lessonBlockExposureSchema.optional()
};

const lessonDefinitionSchema = z.object({
	version: z.enum(['1', '2']).optional().default('1'),
	entryBlockId: z.string().min(1),
	blocks: z
		.array(
			z.discriminatedUnion('kind', [
				z.object({
					kind: z.literal('content'),
					body: z.string(),
					continueLabel: z.string().optional(),
					assetRefs: z.array(lessonAssetRefSchema).optional(),
					...lessonBlockBaseSchema
				}),
				z.object({
					kind: z.literal('choice'),
					body: z.string().optional(),
					options: z.array(lessonChoiceOptionSchema).min(1),
					outputKey: z.string().optional(),
					...lessonBlockBaseSchema
				}),
				z.object({
					kind: z.literal('agent'),
					body: z.string().optional(),
					agentConfig: lessonAgentConfigSchema,
					requiresResponse: z.boolean().optional(),
					...lessonBlockBaseSchema
				}),
				z.object({
					kind: z.literal('end'),
					body: z.string().optional(),
					ctaLabel: z.string().optional(),
					...lessonBlockBaseSchema
				})
			])
		)
		.min(1)
});

export function parseLessonDefinition(content: string): LessonDefinition {
	let parsed: unknown;

	try {
		parsed = JSON.parse(content);
	} catch {
		throw new LessonServiceError(400, 'La definición de la lesson no es un JSON válido.');
	}

	const parseResult = lessonDefinitionSchema.safeParse(parsed);
	if (!parseResult.success) {
		throw new LessonServiceError(
			400,
			`La definición de la lesson no es válida: ${parseResult.error.issues
				.map((issue) => issue.message)
				.join(', ')}.`
		);
	}

	return validateLessonDefinition(migrateLessonDefinition(parseResult.data as LessonDefinitionInput));
}

export function validateLessonDefinition(definition: LessonDefinition): LessonDefinition {
	const normalizedDefinition = normalizeLessonDefinition(definition);
	const blockMap = new Map(normalizedDefinition.blocks.map((block) => [block.id, block]));
	const duplicatedIds = normalizedDefinition.blocks
		.map((block) => block.id)
		.filter((id, index, list) => list.indexOf(id) !== index);

	if (duplicatedIds.length > 0) {
		throw new LessonServiceError(
			400,
			`Hay bloques con IDs duplicados: ${[...new Set(duplicatedIds)].join(', ')}.`
		);
	}

	if (!blockMap.has(normalizedDefinition.entryBlockId)) {
		throw new LessonServiceError(400, 'El bloque de entrada no existe en la definición.');
	}

	for (const block of normalizedDefinition.blocks) {
		assertBlockConfiguration(block);

		if (block.kind === 'end' && (block.next || block.branches?.length)) {
			throw new LessonServiceError(
				400,
				`El bloque final "${block.id}" no puede tener salidas adicionales.`
			);
		}

		if (block.kind === 'choice' && (block.next || block.branches?.length)) {
			throw new LessonServiceError(
				400,
				`El bloque de elección "${block.id}" debe usar únicamente destinos por opción.`
			);
		}

		if (block.kind !== 'end' && block.kind !== 'choice' && !block.next && !(block.branches?.length)) {
			throw new LessonServiceError(
				400,
				`El bloque "${block.id}" necesita un siguiente bloque o una rama condicional.`
			);
		}
	}

	assertTransitionTargets(normalizedDefinition, blockMap);
	assertTemplateReferences(normalizedDefinition);
	return normalizedDefinition;
}

export function getLessonBlock(definition: LessonDefinition, blockId: string): LessonBlock {
	const block = definition.blocks.find((candidate) => candidate.id === blockId);
	if (!block) {
		throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
	}

	return structuredClone(block);
}

export function getAvailableLessonReferenceGroups(
	definition: LessonDefinition
): LessonReferenceGroups {
	const sessionVariables: LessonAvailableVariable[] = [
		{
			path: 'session.id',
			label: 'ID de sesión',
			description: 'Identificador del intento actual.',
			namespace: 'session',
			source: 'session'
		},
		{
			path: 'session.attemptNumber',
			label: 'Número de intento',
			description: 'Intento actual del estudiante en esta lesson.',
			namespace: 'session',
			source: 'session'
		},
		{
			path: 'session.status',
			label: 'Estado',
			description: 'Estado actual de la sesión.',
			namespace: 'session',
			source: 'session'
		},
		{
			path: 'session.currentBlockId',
			label: 'Bloque actual',
			description: 'Bloque activo de la sesión.',
			namespace: 'session',
			source: 'session'
		},
		{
			path: 'session.currentVisitId',
			label: 'Visita actual',
			description: 'Identificador de la visita activa dentro del grafo.',
			namespace: 'session',
			source: 'session'
		},
		{
			path: 'session.activityName',
			label: 'Nombre de la actividad',
			description: 'Nombre visible de la lesson.',
			namespace: 'session',
			source: 'session'
		},
		{
			path: 'session.courseId',
			label: 'Curso',
			description: 'Curso asociado a la sesión.',
			namespace: 'session',
			source: 'session'
		}
	];
	const byBlock = definition.blocks.map((block) => {
		const contract = buildLessonBlockContract(block);
		return {
			blockId: block.id,
			blockTitle: block.title,
			state: contract.state.map((field) => contractFieldToVariable(field, block.id)),
			outputs: contract.outputs.map((field) => contractFieldToVariable(field, block.id))
		} satisfies LessonBlockReferenceGroups;
	});

	return {
		session: sessionVariables,
		state: byBlock.flatMap((group) => group.state),
		outputs: byBlock.flatMap((group) => group.outputs),
		byBlock
	};
}

export function getAvailableLessonVariables(definition: LessonDefinition): LessonAvailableVariable[] {
	const groups = getAvailableLessonReferenceGroups(definition);
	return [...groups.session, ...groups.state, ...groups.outputs];
}

export function getLessonGraphSummaries(definition: LessonDefinition): LessonBlockGraphSummary[] {
	const outgoing = buildTransitionGraph(definition);
	const incoming = buildIncomingTransitionGraph(definition);

	return definition.blocks.map((block) => ({
		blockId: block.id,
		incomingBlockIds: [...(incoming.get(block.id) ?? [])],
		outgoingBlockIds: [...(outgoing.get(block.id) ?? [])],
		contracts: buildLessonBlockContract(block)
	}));
}

export function getLessonBlockGraphSummary(
	definition: LessonDefinition,
	blockId: string
): LessonBlockGraphSummary {
	const summary = getLessonGraphSummaries(definition).find((item) => item.blockId === blockId);
	if (!summary) {
		throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
	}

	return summary;
}

export function buildLessonBlockContract(block: LessonBlock): LessonBlockContract {
	const state: LessonBlockContractField[] = [
		{
			path: `blocks.${block.id}.state.status`,
			key: 'status',
			label: `${block.title} · estado`,
			description: 'Estado resumido de la última visita registrada.',
			type: 'status',
			source: 'system',
			namespace: 'state',
			availableWhen: 'after_visit'
		},
		{
			path: `blocks.${block.id}.state.visitCount`,
			key: 'visitCount',
			label: `${block.title} · visitas`,
			description: 'Número de visitas registradas para este bloque en la sesión.',
			type: 'integer',
			source: 'system',
			namespace: 'state',
			availableWhen: 'after_visit'
		},
		{
			path: `blocks.${block.id}.state.enteredAt`,
			key: 'enteredAt',
			label: `${block.title} · entrada`,
			description: 'Fecha/hora ISO de la última entrada al bloque.',
			type: 'date',
			source: 'system',
			namespace: 'state',
			availableWhen: 'after_visit'
		},
		{
			path: `blocks.${block.id}.state.completedAt`,
			key: 'completedAt',
			label: `${block.title} · completado`,
			description: 'Fecha/hora ISO de la última completitud registrada.',
			type: 'date',
			source: 'system',
			namespace: 'state',
			availableWhen: 'after_completion'
		},
		{
			path: `blocks.${block.id}.state.available`,
			key: 'available',
			label: `${block.title} · disponible`,
			description: 'Indica si este bloque ya tiene una visita persistida en la sesión.',
			type: 'boolean',
			source: 'system',
			namespace: 'state',
			availableWhen: 'always'
		},
		{
			path: `blocks.${block.id}.state.lastVisitId`,
			key: 'lastVisitId',
			label: `${block.title} · última visita`,
			description: 'Identificador de la última visita registrada.',
			type: 'string',
			source: 'system',
			namespace: 'state',
			availableWhen: 'after_visit'
		}
	];

	const outputs: LessonBlockContractField[] = [];

	if (block.kind === 'content') {
		outputs.push(
			{
				path: `blocks.${block.id}.outputs.visited`,
				key: 'visited',
				label: `${block.title} · visitado`,
				description: 'Booleano derivado para saber si el bloque ya fue visitado.',
				type: 'boolean',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'always'
			},
			{
				path: `blocks.${block.id}.outputs.completed`,
				key: 'completed',
				label: `${block.title} · completado`,
				description: 'Booleano derivado para saber si la última visita quedó completada.',
				type: 'boolean',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'always'
			}
		);
	}

	if (block.kind === 'choice') {
		const outputKey = block.outputKey || 'selection';
		outputs.push(
			{
				path: `blocks.${block.id}.outputs.${outputKey}`,
				key: outputKey,
				label: `${block.title} · selección`,
				description: 'Valor elegido por el estudiante en la última visita.',
				type: 'string',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'after_completion'
			},
			{
				path: `blocks.${block.id}.outputs.selectedValue`,
				key: 'selectedValue',
				label: `${block.title} · valor`,
				description: 'Valor bruto elegido por el estudiante.',
				type: 'string',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'after_completion'
			},
			{
				path: `blocks.${block.id}.outputs.selectedLabel`,
				key: 'selectedLabel',
				label: `${block.title} · etiqueta`,
				description: 'Etiqueta visible elegida por el estudiante.',
				type: 'string',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'after_completion'
			},
			{
				path: `blocks.${block.id}.outputs.optionId`,
				key: 'optionId',
				label: `${block.title} · opción`,
				description: 'Identificador interno de la opción elegida.',
				type: 'string',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'after_completion'
			}
		);
	}

	if (block.kind === 'agent') {
		outputs.push(
			{
				path: `blocks.${block.id}.outputs.response`,
				key: 'response',
				label: `${block.title} · respuesta`,
				description: 'Última respuesta útil producida por el bloque IA.',
				type: 'string',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'after_completion'
			},
			{
				path: `blocks.${block.id}.outputs.lastUserMessage`,
				key: 'lastUserMessage',
				label: `${block.title} · último mensaje`,
				description: 'Último mensaje enviado por la persona estudiante en este bloque.',
				type: 'string',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'after_visit'
			},
			{
				path: `blocks.${block.id}.outputs.mode`,
				key: 'mode',
				label: `${block.title} · modo`,
				description: 'Modo de interacción del bloque IA.',
				type: 'string',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'always'
			}
		);

		for (const field of block.agentConfig.outputSchema ?? []) {
			outputs.push(publicOutputField(block, field));
		}
	}

	if (block.kind === 'end') {
		outputs.push({
			path: `blocks.${block.id}.outputs.completed`,
			key: 'completed',
			label: `${block.title} · final alcanzado`,
			description: 'Indica si la sesión alcanzó este nodo final.',
			type: 'boolean',
			source: 'system',
			namespace: 'outputs',
			availableWhen: 'after_completion'
		});
	}

	for (const field of block.exposure?.outputs ?? []) {
		outputs.push(publicOutputField(block, field));
	}

	return {
		blockId: block.id,
		blockTitle: block.title,
		blockKind: block.kind,
		state,
		outputs
	};
}

function migrateLessonDefinition(definition: LessonDefinitionInput): LessonDefinition {
	return {
		version: '2',
		entryBlockId: definition.entryBlockId,
		blocks: definition.blocks.map((block) => structuredClone(block))
	};
}

function normalizeLessonDefinition(definition: LessonDefinition): LessonDefinition {
	return normalizeSimpleLinearOrphans(structuredClone(definition));
}

function normalizeSimpleLinearOrphans(definition: LessonDefinition): LessonDefinition {
	if (definition.blocks.length < 3) {
		return definition;
	}

	if (
		definition.blocks.some(
			(block) => block.kind === 'choice' || Boolean(block.branches && block.branches.length > 0)
		)
	) {
		return definition;
	}

	const endBlocks = definition.blocks.filter((block) => block.kind === 'end');
	if (endBlocks.length !== 1) {
		return definition;
	}

	const endBlockId = endBlocks[0]?.id;
	if (!endBlockId) {
		return definition;
	}

	const blockMap = new Map(definition.blocks.map((block) => [block.id, block]));
	if (!blockMap.has(definition.entryBlockId)) {
		return definition;
	}

	const linearChainIds: string[] = [];
	const visited = new Set<string>();
	let currentBlockId: string | null = definition.entryBlockId;

	while (currentBlockId) {
		if (visited.has(currentBlockId)) {
			return definition;
		}

		const block = blockMap.get(currentBlockId);
		if (!block) {
			return definition;
		}

		visited.add(currentBlockId);
		linearChainIds.push(currentBlockId);

		if (block.kind === 'end') {
			break;
		}

		if (!block.next) {
			return definition;
		}

		currentBlockId = block.next;
	}

	if (linearChainIds.at(-1) !== endBlockId) {
		return definition;
	}

	const linearTailId = linearChainIds.at(-2);
	if (!linearTailId) {
		return definition;
	}

	const incoming = buildIncomingTransitionGraph(definition);
	const orphanBlocks = definition.blocks.filter((block) => {
		if (visited.has(block.id) || block.id === endBlockId || block.kind === 'choice' || block.kind === 'end') {
			return false;
		}

		return (incoming.get(block.id)?.size ?? 0) === 0 && block.next === endBlockId;
	});

	if (orphanBlocks.length === 0) {
		return definition;
	}

	const linearTail = blockMap.get(linearTailId);
	if (!linearTail || linearTail.kind === 'choice' || linearTail.kind === 'end') {
		return definition;
	}

	linearTail.next = orphanBlocks[0]?.id ?? endBlockId;

	for (let index = 0; index < orphanBlocks.length; index += 1) {
		const block = orphanBlocks[index];
		if (!block || block.kind === 'choice' || block.kind === 'end') {
			return definition;
		}

		block.next = orphanBlocks[index + 1]?.id ?? endBlockId;
	}

	return definition;
}

function assertBlockConfiguration(block: LessonBlock): void {
	if (!block.id.match(/^[a-zA-Z0-9_-]+$/)) {
		throw new LessonServiceError(
			400,
			`El bloque "${block.id}" usa un ID inválido. Solo se permiten letras, números, "_" y "-".`
		);
	}

	if (block.kind === 'choice') {
		const duplicatedOptionIds = block.options
			.map((option) => option.id)
			.filter((id, index, list) => list.indexOf(id) !== index);

		if (duplicatedOptionIds.length > 0) {
			throw new LessonServiceError(
				400,
				`El bloque "${block.id}" tiene opciones duplicadas: ${[
					...new Set(duplicatedOptionIds)
				].join(', ')}.`
			);
		}
	}

	if (block.kind === 'agent') {
		const duplicatedKeys = (block.agentConfig.outputSchema ?? [])
			.map((field) => field.key)
			.filter((key, index, list) => list.indexOf(key) !== index);

		if (duplicatedKeys.length > 0) {
			throw new LessonServiceError(
				400,
				`El bloque "${block.id}" define outputs IA duplicados: ${[
					...new Set(duplicatedKeys)
				].join(', ')}.`
			);
		}
	}
}

function buildTransitionGraph(definition: LessonDefinition): Map<string, Set<string>> {
	const graph = new Map<string, Set<string>>();

	for (const block of definition.blocks) {
		const targets = new Set<string>();
		if (block.next) targets.add(block.next);

		if (block.kind === 'choice') {
			for (const option of block.options) targets.add(option.targetBlockId);
		}

		for (const branch of block.branches ?? []) {
			targets.add(branch.targetBlockId);
		}

		graph.set(block.id, targets);
	}

	return graph;
}

function buildIncomingTransitionGraph(definition: LessonDefinition): Map<string, Set<string>> {
	const incoming = new Map<string, Set<string>>();

	for (const block of definition.blocks) {
		if (!incoming.has(block.id)) incoming.set(block.id, new Set());

		if (block.next) {
			if (!incoming.has(block.next)) incoming.set(block.next, new Set());
			incoming.get(block.next)?.add(block.id);
		}

		if (block.kind === 'choice') {
			for (const option of block.options) {
				if (!incoming.has(option.targetBlockId)) incoming.set(option.targetBlockId, new Set());
				incoming.get(option.targetBlockId)?.add(block.id);
			}
		}

		for (const branch of block.branches ?? []) {
			if (!incoming.has(branch.targetBlockId)) incoming.set(branch.targetBlockId, new Set());
			incoming.get(branch.targetBlockId)?.add(block.id);
		}
	}

	return incoming;
}

function assertTransitionTargets(
	definition: LessonDefinition,
	blockMap: Map<string, LessonBlock>
): void {
	for (const block of definition.blocks) {
		if (block.next && !blockMap.has(block.next)) {
			throw new LessonServiceError(
				400,
				`El bloque "${block.id}" referencia un siguiente bloque inexistente: "${block.next}".`
			);
		}

		if (block.kind === 'choice') {
			for (const option of block.options) {
				if (!blockMap.has(option.targetBlockId)) {
					throw new LessonServiceError(
						400,
						`La opción "${option.id}" del bloque "${block.id}" apunta a "${option.targetBlockId}", que no existe.`
					);
				}
			}
		}

		for (const branch of block.branches ?? []) {
			if (!blockMap.has(branch.targetBlockId)) {
				throw new LessonServiceError(
					400,
					`Una rama del bloque "${block.id}" apunta a "${branch.targetBlockId}", que no existe.`
				);
			}
		}
	}
}

function assertTemplateReferences(definition: LessonDefinition): void {
	for (const block of definition.blocks) {
		for (const reference of extractBlockReferences(block)) {
			if (reference.startsWith('session.')) continue;

			if (!reference.startsWith('blocks.')) {
				throw new LessonServiceError(
					400,
					`La referencia "${reference}" del bloque "${block.id}" debe empezar por "session." o "blocks."`
				);
			}

			const [, targetBlockId, namespace] = reference.split('.');
			if (!targetBlockId || !namespace) {
				throw new LessonServiceError(
					400,
					`La referencia "${reference}" del bloque "${block.id}" no es válida.`
				);
			}

			if (namespace !== 'state' && namespace !== 'outputs') {
				throw new LessonServiceError(
					400,
					`La referencia "${reference}" del bloque "${block.id}" debe usar ".state." o ".outputs."`
				);
			}

			if (!definition.blocks.some((candidate) => candidate.id === targetBlockId)) {
				throw new LessonServiceError(
					400,
					`La referencia "${reference}" del bloque "${block.id}" apunta al bloque "${targetBlockId}", que no existe.`
				);
			}
		}
	}
}

function extractBlockReferences(block: LessonBlock): string[] {
	const references = new Set<string>();
	const templatePattern = /\{\{\s*([^}]+?)\s*\}\}/g;
	const register = (template: string | null | undefined) => {
		if (!template) return;
		for (const match of template.matchAll(templatePattern)) {
			const reference = match[1]?.trim();
			if (reference) references.add(reference);
		}
	};

	register(block.title);
	register(block.body);

	if (block.kind === 'content') {
		register(block.continueLabel);
	}

	if (block.kind === 'choice') {
		for (const option of block.options) {
			register(option.label);
			register(option.description);
		}
	}

	if (block.kind === 'agent') {
		register(block.agentConfig.systemPrompt);
		register(block.agentConfig.promptTemplate);
		register(block.agentConfig.placeholder);
		register(block.agentConfig.submitLabel);
		register(block.agentConfig.continueLabel);
		register(block.agentConfig.initialAssistantMessage);
	}

	if (block.kind === 'end') {
		register(block.ctaLabel);
	}

	for (const branch of block.branches ?? []) {
		register(branch.label);
		if (branch.condition?.source) references.add(branch.condition.source);
	}

	return [...references];
}

function contractFieldToVariable(
	field: LessonBlockContractField,
	blockId: string
): LessonAvailableVariable {
	return {
		path: field.path,
		label: field.label,
		description: field.description,
		namespace: field.namespace,
		blockId,
		source: field.namespace === 'state' ? 'block-state' : 'block-output'
	};
}

function publicOutputField(
	block: LessonBlock,
	field: LessonOutputField
): LessonBlockContractField {
	return {
		path: `blocks.${block.id}.outputs.${field.key}`,
		key: field.key,
		label: `${block.title} · ${field.key}`,
		description: field.description || `Output público del bloque "${block.title}".`,
		type: field.type,
		source: 'public',
		namespace: 'outputs',
		availableWhen: 'after_completion'
	};
}
