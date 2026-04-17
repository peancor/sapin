import { MarkerType, Position, type XYPosition } from '@xyflow/svelte';
import {
	getLessonAgentInteractionLabel,
	getLessonAgentExecutionTriggerLabel,
	type LessonBlock,
	type LessonDefinition
} from '../types/lesson';
import type {
	LessonFlowEdge,
	LessonFlowEdgeData,
	LessonFlowEdgeType,
	LessonFlowHandleDescriptor,
	LessonFlowGraph,
	LessonFlowNode
} from '../types/lessonFlow';

const FLOW_NODE_GAP_X = 360;
const FLOW_NODE_GAP_Y = 260;
const FLOW_EDGE_TYPE = 'smoothstep';
const LESSON_NODE_TYPE = 'lesson-block';
const OPEN_TARGET_HANDLE_ID = 'in:open';

interface LessonFlowIncomingHandleState {
	handles: LessonFlowHandleDescriptor[];
	targetHandleByEdgeId: Map<string, string>;
}

export function getLessonBlockKindLabel(kind: LessonBlock['kind']): string {
	if (kind === 'content') return 'Contenido';
	if (kind === 'choice') return 'Decision';
	if (kind === 'agent') return 'Tutor IA';
	return 'Final';
}

export function summarizeLessonBlock(block: LessonBlock): string {
	if (block.kind === 'choice') {
		return `${block.options.length} opcion${block.options.length === 1 ? '' : 'es'} · salida ${block.outputKey || 'selection'}`;
	}

	if (block.kind === 'agent') {
		return `${getLessonAgentInteractionLabel(block.agentConfig)} · ${getLessonAgentExecutionTriggerLabel(block.agentConfig)}${block.next ? ` · siguiente ${block.next}` : ''}`;
	}

	if (block.kind === 'end') {
		return 'Nodo de cierre';
	}

	const branchCount = block.branches?.length ?? 0;
	return `${block.next ? `siguiente ${block.next}` : 'sin siguiente'}${branchCount ? ` · ${branchCount} rama${branchCount === 1 ? '' : 's'}` : ''}`;
}

export function createLessonFlowGraph(definition: LessonDefinition): LessonFlowGraph {
	const edgeInputs = collectEdgeInputs(definition);
	const outgoingMap = buildOutgoingMap(edgeInputs);
	const incomingMap = buildIncomingMap(definition, edgeInputs);
	const fallbackPositions = computeFallbackPositions(definition, outgoingMap);
	const incomingHandleStateByBlockId = new Map<string, LessonFlowIncomingHandleState>();

	const nodes: LessonFlowNode[] = definition.blocks.map((block) => {
		const position = block.graph?.position ?? fallbackPositions.get(block.id) ?? { x: 0, y: 0 };
		const incomingHandleState = createIncomingHandleState(block, incomingMap.get(block.id) ?? []);
		const outgoingHandles = createOutgoingHandles(block);
		incomingHandleStateByBlockId.set(block.id, incomingHandleState);

		return {
			id: block.id,
			type: LESSON_NODE_TYPE,
			position,
			data: {
				blockId: block.id,
				title: block.title,
				kind: block.kind,
				kindLabel: getLessonBlockKindLabel(block.kind),
				isEntry: definition.entryBlockId === block.id,
				incomingCount: incomingMap.get(block.id)?.length ?? 0,
				outgoingCount: outgoingMap.get(block.id)?.length ?? 0,
				summary: summarizeLessonBlock(block),
				incomingHandles: incomingHandleState.handles,
				outgoingHandles
			},
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
			deletable: false
		};
	});

	const targetHandleByEdgeId = new Map<string, string>();
	for (const incomingHandleState of incomingHandleStateByBlockId.values()) {
		for (const [edgeId, handleId] of incomingHandleState.targetHandleByEdgeId.entries()) {
			targetHandleByEdgeId.set(edgeId, handleId);
		}
	}

	const edges: LessonFlowEdge[] = edgeInputs.map((edgeInput) =>
		createLessonFlowEdge({
			...edgeInput,
			sourceHandle: getLessonFlowSourceHandleId(edgeInput),
			targetHandle: targetHandleByEdgeId.get(edgeInput.id) ?? OPEN_TARGET_HANDLE_ID
		})
	);

	return {
		nodes,
		edges
	};
}

export function applyLessonFlowGraph(
	definition: LessonDefinition,
	graph: LessonFlowGraph
): LessonDefinition {
	const nextDefinition = structuredClone(definition);
	const positionById = new Map(graph.nodes.map((node) => [node.id, node.position]));
	const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
	const incomingOrderByBlockId = new Map(
		graph.nodes.map((node) => [
			node.id,
			node.data.incomingHandles
				.filter((handle) => handle.incomingKind === 'occupied' && handle.edgeId)
				.map((handle) => handle.edgeId as string)
		])
	);

	for (const block of nextDefinition.blocks) {
		const position = positionById.get(block.id);
		const nextGraph = {
			...(block.graph ?? {}),
			...(supportsDynamicIncomingHandles(block)
				? { incomingOrder: incomingOrderByBlockId.get(block.id) ?? [] }
				: {})
		};

		if (position) {
			nextGraph.position = {
				x: position.x,
				y: position.y
			};
		}

		if (Object.keys(nextGraph).length > 0) {
			block.graph = nextGraph;
		}

		if (block.kind !== 'choice' && block.kind !== 'end') {
			const nextEdge = edgeById.get(getLessonFlowNextEdgeId(block.id));
			block.next = nextEdge?.target ?? null;
		}

		if (block.branches?.length) {
			block.branches = block.branches.map((branch, branchIndex) => {
				const branchEdge = edgeById.get(getLessonFlowBranchEdgeId(block.id, branchIndex));
				return {
					...branch,
					targetBlockId: branchEdge?.target ?? branch.targetBlockId
				};
			});
		}

		if (block.kind === 'choice') {
			block.options = block.options.map((option) => {
				const choiceEdge = edgeById.get(getLessonFlowChoiceEdgeId(block.id, option.id));
				return {
					...option,
					targetBlockId: choiceEdge?.target ?? option.targetBlockId
				};
			});
		}
	}

	return nextDefinition;
}

export function getLessonFlowNextEdgeId(blockId: string): string {
	return `next:${blockId}`;
}

export function getLessonFlowBranchEdgeId(blockId: string, branchIndex: number): string {
	return `branch:${blockId}:${branchIndex}`;
}

export function getLessonFlowChoiceEdgeId(blockId: string, optionId: string): string {
	return `choice:${blockId}:${optionId}`;
}

export function getLessonFlowEdgeTypeLabel(edgeType: LessonFlowEdgeType): string {
	if (edgeType === 'next') return 'Recorrido principal';
	if (edgeType === 'branch') return 'Rama condicional';
	return 'Opcion de decision';
}

function createLessonFlowEdge(input: {
	id: string;
	source: string;
	target: string;
	label: string;
	edgeType: LessonFlowEdgeType;
	sourceHandle: string;
	targetHandle: string;
	branchIndex?: number;
	optionId?: string;
	optionValue?: string;
	conditionSource?: string;
	conditionOperator?: LessonFlowEdgeData['conditionOperator'];
	conditionValue?: LessonFlowEdgeData['conditionValue'];
}): LessonFlowEdge {
	const style =
		input.edgeType === 'next'
			? 'stroke:#9a7b4f;stroke-width:2.4'
			: input.edgeType === 'branch'
				? 'stroke:#0f766e;stroke-width:2.2;stroke-dasharray:7 5'
				: 'stroke:#4f46e5;stroke-width:2.2';

	return {
		id: input.id,
		type: FLOW_EDGE_TYPE,
		source: input.source,
		target: input.target,
		sourceHandle: input.sourceHandle,
		targetHandle: input.targetHandle,
		label: input.label,
		labelStyle:
			'fill:var(--xy-edge-label-color,#3f3a32);font-size:12px;font-weight:600;background:transparent',
		style,
		markerEnd: {
			type: MarkerType.ArrowClosed
		},
		selectable: true,
		data: {
			edgeType: input.edgeType,
			sourceBlockId: input.source,
			targetBlockId: input.target,
			label: input.label,
			branchIndex: input.branchIndex,
			optionId: input.optionId,
			optionValue: input.optionValue,
			conditionSource: input.conditionSource,
			conditionOperator: input.conditionOperator,
			conditionValue: input.conditionValue
		}
	};
}

function collectEdgeInputs(definition: LessonDefinition): Array<{
	id: string;
	source: string;
	target: string;
	label: string;
	edgeType: LessonFlowEdgeType;
	branchIndex?: number;
	optionId?: string;
	optionValue?: string;
	conditionSource?: string;
	conditionOperator?: LessonFlowEdgeData['conditionOperator'];
	conditionValue?: LessonFlowEdgeData['conditionValue'];
}> {
	const edgeInputs: Array<{
		id: string;
		source: string;
		target: string;
		label: string;
		edgeType: LessonFlowEdgeType;
		branchIndex?: number;
		optionId?: string;
		optionValue?: string;
		conditionSource?: string;
		conditionOperator?: LessonFlowEdgeData['conditionOperator'];
		conditionValue?: LessonFlowEdgeData['conditionValue'];
	}> = [];

	for (const block of definition.blocks) {
		if (block.kind !== 'choice' && block.kind !== 'end' && hasConnectedTarget(block.next)) {
			edgeInputs.push({
				id: getLessonFlowNextEdgeId(block.id),
				source: block.id,
				target: block.next,
				label: 'Continuar',
				edgeType: 'next'
			});
		}

		for (const [branchIndex, branch] of (block.branches ?? []).entries()) {
			if (!hasConnectedTarget(branch.targetBlockId)) continue;

			edgeInputs.push({
				id: getLessonFlowBranchEdgeId(block.id, branchIndex),
				source: block.id,
				target: branch.targetBlockId,
				label: branch.label?.trim() || `Rama ${branchIndex + 1}`,
				edgeType: 'branch',
				branchIndex,
				conditionSource: branch.condition?.source,
				conditionOperator: branch.condition?.operator,
				conditionValue: branch.condition?.value ?? null
			});
		}

		if (block.kind === 'choice') {
			for (const option of block.options) {
				if (!hasConnectedTarget(option.targetBlockId)) continue;

				edgeInputs.push({
					id: getLessonFlowChoiceEdgeId(block.id, option.id),
					source: block.id,
					target: option.targetBlockId,
					label: option.label,
					edgeType: 'choice-option',
					optionId: option.id,
					optionValue: option.value
				});
			}
		}
	}

	return edgeInputs;
}

function hasConnectedTarget(targetBlockId: string | null | undefined): targetBlockId is string {
	return typeof targetBlockId === 'string' && targetBlockId.trim().length > 0;
}

function buildOutgoingMap(
	edgeInputs: Array<{
		source: string;
		target: string;
	}>
): Map<string, string[]> {
	const outgoingMap = new Map<string, string[]>();

	for (const edgeInput of edgeInputs) {
		const currentTargets = outgoingMap.get(edgeInput.source) ?? [];
		outgoingMap.set(edgeInput.source, [...currentTargets, edgeInput.target]);
	}

	return outgoingMap;
}

function buildIncomingMap(
	definition: LessonDefinition,
	edgeInputs: Array<{
		id: string;
		target: string;
	}>
): Map<string, string[]> {
	const incomingMap = new Map<string, string[]>();

	for (const block of definition.blocks) {
		incomingMap.set(block.id, []);
	}

	for (const edgeInput of edgeInputs) {
		const current = incomingMap.get(edgeInput.target) ?? [];
		incomingMap.set(edgeInput.target, [...current, edgeInput.id]);
	}

	return incomingMap;
}

function computeFallbackPositions(
	definition: LessonDefinition,
	outgoingMap: Map<string, string[]>
): Map<string, XYPosition> {
	const levels = new Map<string, number>();
	const visited = new Set<string>();
	const queue: string[] = definition.entryBlockId ? [definition.entryBlockId] : [];

	if (definition.entryBlockId) {
		levels.set(definition.entryBlockId, 0);
	}

	while (queue.length > 0) {
		const currentBlockId = queue.shift();
		if (!currentBlockId || visited.has(currentBlockId)) continue;

		visited.add(currentBlockId);
		const currentLevel = levels.get(currentBlockId) ?? 0;

		for (const targetId of outgoingMap.get(currentBlockId) ?? []) {
			if (!levels.has(targetId)) {
				levels.set(targetId, currentLevel + 1);
			}
			if (!visited.has(targetId)) {
				queue.push(targetId);
			}
		}
	}

	let fallbackLevel = Math.max(0, ...levels.values(), 0) + 1;
	for (const block of definition.blocks) {
		if (!levels.has(block.id)) {
			levels.set(block.id, fallbackLevel);
			fallbackLevel += 1;
		}
	}

	const rowsByLevel = new Map<number, number>();
	const positions = new Map<string, XYPosition>();

	for (const block of definition.blocks) {
		if (block.graph?.position) continue;

		const level = levels.get(block.id) ?? 0;
		const row = rowsByLevel.get(level) ?? 0;
		rowsByLevel.set(level, row + 1);

		positions.set(block.id, {
			x: row * FLOW_NODE_GAP_X,
			y: level * FLOW_NODE_GAP_Y
		});
	}

	return positions;
}

function createOutgoingHandles(block: LessonBlock): LessonFlowHandleDescriptor[] {
	if (block.kind === 'end') {
		return [];
	}

	if (block.kind === 'choice') {
		return block.options.map((option, index) => ({
			id: getLessonFlowChoiceHandleId(option.id),
			label: option.label?.trim() || `Opción ${index + 1}`,
			edgeType: 'choice-option'
		}));
	}

	const handles: LessonFlowHandleDescriptor[] = [
		{
			id: getLessonFlowNextHandleId(),
			label: 'Siguiente',
			edgeType: 'next'
		}
	];

	for (const [branchIndex, branch] of (block.branches ?? []).entries()) {
		handles.push({
			id: getLessonFlowBranchHandleId(branchIndex),
			label: branch.label?.trim() || `Rama ${branchIndex + 1}`,
			edgeType: 'branch'
		});
	}

	return handles;
}

function getLessonFlowSourceHandleId(edgeInput: {
	edgeType: LessonFlowEdgeType;
	branchIndex?: number;
	optionId?: string;
}): string {
	if (edgeInput.edgeType === 'next') {
		return getLessonFlowNextHandleId();
	}

	if (edgeInput.edgeType === 'branch') {
		return getLessonFlowBranchHandleId(edgeInput.branchIndex ?? 0);
	}

	return getLessonFlowChoiceHandleId(edgeInput.optionId ?? 'option');
}

export function getLessonFlowNextHandleId(): string {
	return 'out:next';
}

export function getLessonFlowBranchHandleId(branchIndex: number): string {
	return `out:branch:${branchIndex}`;
}

export function getLessonFlowChoiceHandleId(optionId: string): string {
	return `out:choice:${optionId}`;
}

export function getLessonFlowIncomingHandleId(edgeId: string): string {
	return `in:${edgeId}`;
}

export function getLessonFlowIncomingAddHandleId(blockId: string): string {
	return `in:add:${blockId}`;
}

function supportsDynamicIncomingHandles(block: Pick<LessonBlock, 'kind'>): boolean {
	return block.kind === 'end';
}

function createIncomingHandleState(
	block: LessonBlock,
	edgeIds: string[]
): LessonFlowIncomingHandleState {
	if (!supportsDynamicIncomingHandles(block)) {
		return {
			handles: [
				{
					id: OPEN_TARGET_HANDLE_ID,
					label: 'Entrada',
					edgeType: 'incoming',
					incomingKind: 'single'
				}
			],
			targetHandleByEdgeId: new Map(edgeIds.map((edgeId) => [edgeId, OPEN_TARGET_HANDLE_ID]))
		};
	}

	const orderedEdgeIds = orderIncomingEdgeIds(block, edgeIds);
	const handles: LessonFlowHandleDescriptor[] = orderedEdgeIds.map((edgeId, index) => ({
		id: getLessonFlowIncomingHandleId(edgeId),
		label: `Entrada ${index + 1}`,
		edgeType: 'incoming',
		incomingKind: 'occupied',
		edgeId
	}));

	handles.push({
		id: getLessonFlowIncomingAddHandleId(block.id),
		label: 'Añadir entrada',
		edgeType: 'incoming',
		incomingKind: 'add'
	});

	return {
		handles,
		targetHandleByEdgeId: new Map(
			orderedEdgeIds.map((edgeId) => [edgeId, getLessonFlowIncomingHandleId(edgeId)])
		)
	};
}

function orderIncomingEdgeIds(block: LessonBlock, edgeIds: string[]): string[] {
	const preferredOrder = block.graph?.incomingOrder ?? [];
	const activeEdgeIds = new Set(edgeIds);
	const orderedEdgeIds = preferredOrder.filter((edgeId) => activeEdgeIds.has(edgeId));

	for (const edgeId of edgeIds) {
		if (!orderedEdgeIds.includes(edgeId)) {
			orderedEdgeIds.push(edgeId);
		}
	}

	return orderedEdgeIds;
}
