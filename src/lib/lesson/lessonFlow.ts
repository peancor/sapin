import { MarkerType, Position, type XYPosition } from '@xyflow/svelte';
import type { LessonBlock, LessonDefinition } from '../types/lesson';
import type {
	LessonFlowEdge,
	LessonFlowEdgeData,
	LessonFlowEdgeType,
	LessonFlowGraph,
	LessonFlowNode
} from '../types/lessonFlow';

const FLOW_NODE_GAP_X = 360;
const FLOW_NODE_GAP_Y = 220;
const FLOW_EDGE_TYPE = 'smoothstep';
const LESSON_NODE_TYPE = 'lesson-block';

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
		return `${block.agentConfig.mode === 'mini_chat' ? 'Mini chat' : 'Turno guiado'}${block.next ? ` · siguiente ${block.next}` : ''}`;
	}

	if (block.kind === 'end') {
		return 'Nodo de cierre';
	}

	const branchCount = block.branches?.length ?? 0;
	return `${block.next ? `siguiente ${block.next}` : 'sin siguiente'}${branchCount ? ` · ${branchCount} rama${branchCount === 1 ? '' : 's'}` : ''}`;
}

export function createLessonFlowGraph(definition: LessonDefinition): LessonFlowGraph {
	const outgoingMap = buildOutgoingMap(definition);
	const incomingMap = buildIncomingMap(definition);
	const fallbackPositions = computeFallbackPositions(definition, outgoingMap);

	const nodes: LessonFlowNode[] = definition.blocks.map((block) => {
		const position = block.graph?.position ?? fallbackPositions.get(block.id) ?? { x: 0, y: 0 };

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
				summary: summarizeLessonBlock(block)
			},
			sourcePosition: Position.Right,
			targetPosition: Position.Left,
			deletable: false
		};
	});

	const edges: LessonFlowEdge[] = [];

	for (const block of definition.blocks) {
		if (block.kind !== 'choice' && block.kind !== 'end' && block.next) {
			edges.push(
				createLessonFlowEdge({
					id: getLessonFlowNextEdgeId(block.id),
					source: block.id,
					target: block.next,
					label: 'Continuar',
					edgeType: 'next'
				})
			);
		}

		for (const [branchIndex, branch] of (block.branches ?? []).entries()) {
			edges.push(
				createLessonFlowEdge({
					id: getLessonFlowBranchEdgeId(block.id, branchIndex),
					source: block.id,
					target: branch.targetBlockId,
					label: branch.label?.trim() || `Rama ${branchIndex + 1}`,
					edgeType: 'branch',
					branchIndex,
					conditionSource: branch.condition?.source,
					conditionOperator: branch.condition?.operator,
					conditionValue: branch.condition?.value ?? null
				})
			);
		}

		if (block.kind === 'choice') {
			for (const option of block.options) {
				edges.push(
					createLessonFlowEdge({
						id: getLessonFlowChoiceEdgeId(block.id, option.id),
						source: block.id,
						target: option.targetBlockId,
						label: option.label,
						edgeType: 'choice-option',
						optionId: option.id,
						optionValue: option.value
					})
				);
			}
		}
	}

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

	for (const block of nextDefinition.blocks) {
		const position = positionById.get(block.id);
		if (position) {
			block.graph = {
				...(block.graph ?? {}),
				position: {
					x: position.x,
					y: position.y
				}
			};
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

function buildOutgoingMap(definition: LessonDefinition): Map<string, string[]> {
	const outgoingMap = new Map<string, string[]>();

	for (const block of definition.blocks) {
		const targets: string[] = [];

		if (block.kind !== 'choice' && block.kind !== 'end' && block.next) {
			targets.push(block.next);
		}

		for (const branch of block.branches ?? []) {
			targets.push(branch.targetBlockId);
		}

		if (block.kind === 'choice') {
			for (const option of block.options) {
				targets.push(option.targetBlockId);
			}
		}

		outgoingMap.set(block.id, targets);
	}

	return outgoingMap;
}

function buildIncomingMap(definition: LessonDefinition): Map<string, string[]> {
	const incomingMap = new Map<string, string[]>();

	for (const block of definition.blocks) {
		incomingMap.set(block.id, []);
	}

	for (const [sourceId, targets] of buildOutgoingMap(definition)) {
		for (const targetId of targets) {
			const current = incomingMap.get(targetId) ?? [];
			if (!current.includes(sourceId)) {
				incomingMap.set(targetId, [...current, sourceId]);
			}
		}
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
			x: level * FLOW_NODE_GAP_X,
			y: row * FLOW_NODE_GAP_Y
		});
	}

	return positions;
}
