import { MarkerType, Position, type XYPosition } from '@xyflow/svelte';
import {
	getLessonAgentInteractionLabel,
	getLessonAgentExecutionTriggerLabel,
	type LessonBlock,
	type LessonBlockGraphEdgeRoute,
	type LessonBlockGraphRoutePoint,
	type LessonDefinition
} from '../types/lesson';
import type {
	LessonFlowEdge,
	LessonFlowEdgeData,
	LessonFlowEdgeRouteMode,
	LessonFlowEdgeType,
	LessonFlowHandleDescriptor,
	LessonFlowGraph,
	LessonFlowNode,
	LessonFlowRoutePoint
} from '../types/lessonFlow';

const FLOW_NODE_GAP_X = 360;
const FLOW_NODE_GAP_Y = 260;
const FLOW_EDGE_TYPE = 'lesson-route';
const LESSON_NODE_TYPE = 'lesson-block';
const FLOW_NODE_WIDTH = 252;
const FLOW_NODE_HEIGHT = 156;
const RETURN_ROUTE_LANE_GAP = 96;
const RETURN_ROUTE_EXTRA_LANE_GAPS = [0, 72, 144];
const RETURN_ROUTE_EXIT_GAP = 56;
const RETURN_ROUTE_ENTRY_GAP = 56;
const RETURN_ROUTE_OBSTACLE_PADDING = 36;

interface LessonFlowIncomingHandleState {
	handles: LessonFlowHandleDescriptor[];
	targetHandleByEdgeId: Map<string, string>;
}

interface LessonFlowRouteRect {
	id: string;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export function getLessonBlockKindLabel(kind: LessonBlock['kind']): string {
	if (kind === 'content') return 'Contenido';
	if (kind === 'choice') return 'Decision';
	if (kind === 'check') return 'Evaluacion';
	if (kind === 'agent') return 'Tutor IA';
	if (kind === 'youtube') return 'YouTube';
	return 'Final';
}

export function summarizeLessonBlock(block: LessonBlock): string {
	if (block.kind === 'choice') {
		return `${block.options.length} opcion${block.options.length === 1 ? '' : 'es'} · salida ${block.outputKey || 'selection'}`;
	}

	if (block.kind === 'agent') {
		const autoStartLabel =
			block.agentConfig.autoStartOnEnter && block.agentConfig.interactionMode !== 'none'
				? ' · auto al entrar'
				: '';
		const turnSummary =
			block.agentConfig.interactionMode === 'single_turn'
				? ' · 1 turno alumno'
				: block.agentConfig.interactionMode === 'multi_turn'
					? block.agentConfig.maxTurns
						? ` · hasta ${block.agentConfig.maxTurns} turnos`
						: ' · turnos abiertos'
					: '';
		return `${getLessonAgentInteractionLabel(block.agentConfig)} · ${getLessonAgentExecutionTriggerLabel(block.agentConfig)}${autoStartLabel}${turnSummary}${block.next ? ` · siguiente ${block.next}` : ''}`;
	}

	if (block.kind === 'check') {
		const questionCount = block.checkConfig.questions.length;
		const modeLabel =
			block.checkConfig.presentationMode === 'step_by_step' ? 'paso a paso' : 'todas juntas';
		return `${questionCount} pregunta${questionCount === 1 ? '' : 's'} · ${modeLabel} · aprobar ${block.checkConfig.passingScore}${block.next ? ` · siguiente ${block.next}` : ''}`;
	}

	if (block.kind === 'youtube') {
		const segment =
			block.startSeconds !== null && block.startSeconds !== undefined
				? `desde ${block.startSeconds}s${block.endSeconds ? ` a ${block.endSeconds}s` : ''}`
				: block.endSeconds
					? `hasta ${block.endSeconds}s`
					: 'video completo';
		const pauseCount = block.pausePoints?.length ?? 0;
		return `${segment}${pauseCount ? ` · ${pauseCount} pausa${pauseCount === 1 ? '' : 's'}` : ''}${block.next ? ` · siguiente ${block.next}` : ''}`;
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

	const nodeById = new Map(nodes.map((node) => [node.id, node]));
	const edges: LessonFlowEdge[] = edgeInputs.map((edgeInput) => {
		const sourceHandle = getLessonFlowSourceHandleId(edgeInput);
		const targetHandle =
			targetHandleByEdgeId.get(edgeInput.id) ?? getLessonFlowIncomingHandleId(edgeInput.id);
		const routePoints =
			edgeInput.routePoints ??
			createAutomaticRoutePoints({
				edgeInput,
				sourceNode: nodeById.get(edgeInput.source),
				targetNode: nodeById.get(edgeInput.target),
				nodes,
				sourceHandle,
				targetHandle
			});

		return createLessonFlowEdge({
			...edgeInput,
			sourceHandle,
			targetHandle,
			routePoints,
			routeMode: edgeInput.routePoints ? 'manual' : 'auto',
			isAutoRouted: !edgeInput.routePoints && routePoints.length > 0
		});
	});

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
	const manualEdgeRoutesBySourceId = new Map<string, Record<string, LessonBlockGraphEdgeRoute>>();
	const incomingOrderByBlockId = new Map(
		graph.nodes.map((node) => [
			node.id,
			node.data.incomingHandles
				.filter((handle) => handle.incomingKind === 'occupied' && handle.edgeId)
				.map((handle) => handle.edgeId as string)
		])
	);

	for (const edge of graph.edges) {
		if (edge.data?.routeMode !== 'manual') continue;
		const points = sanitizeRoutePoints(edge.data.routePoints ?? []);
		if (points.length === 0) continue;

		const sourceRoutes = manualEdgeRoutesBySourceId.get(edge.source) ?? {};
		sourceRoutes[edge.id] = { points };
		manualEdgeRoutesBySourceId.set(edge.source, sourceRoutes);
	}

	for (const block of nextDefinition.blocks) {
		const position = positionById.get(block.id);
		const edgeRoutes = manualEdgeRoutesBySourceId.get(block.id);
		const nextGraph = {
			...(block.graph ?? {}),
			...(() => {
				if (!supportsDynamicIncomingHandles()) return {};
				const incomingOrder = incomingOrderByBlockId.get(block.id) ?? [];
				return incomingOrder.length > 0 ? { incomingOrder } : {};
			})(),
			...(edgeRoutes ? { edgeRoutes } : {})
		};

		if (position) {
			nextGraph.position = {
				x: position.x,
				y: position.y
			};
		}

		if (!edgeRoutes) {
			delete nextGraph.edgeRoutes;
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
					targetBlockId: branchEdge?.target ?? ''
				};
			});
		}

		if (block.kind === 'choice') {
			block.options = block.options.map((option) => {
				const choiceEdge = edgeById.get(getLessonFlowChoiceEdgeId(block.id, option.id));
				return {
					...option,
					targetBlockId: choiceEdge?.target ?? ''
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
	routePoints: LessonFlowRoutePoint[];
	routeMode: LessonFlowEdgeRouteMode;
	isAutoRouted: boolean;
}): LessonFlowEdge {
	const style =
		input.edgeType === 'next'
			? 'stroke:#2e7d32;stroke-width:2.4'
			: input.edgeType === 'branch'
				? 'stroke:#ff9f2e;stroke-width:2.2;stroke-dasharray:7 5'
				: 'stroke:#0f2537;stroke-width:2.2';

	return {
		id: input.id,
		type: FLOW_EDGE_TYPE,
		source: input.source,
		target: input.target,
		sourceHandle: input.sourceHandle,
		targetHandle: input.targetHandle,
		label: input.label,
		labelStyle:
			'fill:var(--xy-edge-label-color,#0f2537);font-size:12px;font-weight:600;background:transparent',
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
			conditionValue: input.conditionValue,
			routePoints: input.routePoints,
			routeMode: input.routeMode,
			isAutoRouted: input.isAutoRouted
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
	routePoints?: LessonFlowRoutePoint[];
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
		routePoints?: LessonFlowRoutePoint[];
	}> = [];
	const blockIds = new Set(definition.blocks.map((block) => block.id));
	const hasExistingTarget = (targetBlockId: string | null | undefined): targetBlockId is string =>
		hasConnectedTarget(targetBlockId) && blockIds.has(targetBlockId);

	for (const block of definition.blocks) {
		if (block.kind !== 'choice' && block.kind !== 'end' && hasExistingTarget(block.next)) {
			const edgeId = getLessonFlowNextEdgeId(block.id);
			edgeInputs.push({
				id: edgeId,
				source: block.id,
				target: block.next,
				label: 'Continuar',
				edgeType: 'next',
				routePoints: getSavedRoutePoints(block, edgeId)
			});
		}

		for (const [branchIndex, branch] of (block.branches ?? []).entries()) {
			if (!hasExistingTarget(branch.targetBlockId)) continue;
			const edgeId = getLessonFlowBranchEdgeId(block.id, branchIndex);

			edgeInputs.push({
				id: edgeId,
				source: block.id,
				target: branch.targetBlockId,
				label: branch.label?.trim() || `Rama ${branchIndex + 1}`,
				edgeType: 'branch',
				branchIndex,
				conditionSource: branch.condition?.source,
				conditionOperator: branch.condition?.operator,
				conditionValue: branch.condition?.value ?? null,
				routePoints: getSavedRoutePoints(block, edgeId)
			});
		}

		if (block.kind === 'choice') {
			for (const option of block.options) {
				if (!hasExistingTarget(option.targetBlockId)) continue;
				const edgeId = getLessonFlowChoiceEdgeId(block.id, option.id);

				edgeInputs.push({
					id: edgeId,
					source: block.id,
					target: option.targetBlockId,
					label: option.label,
					edgeType: 'choice-option',
					optionId: option.id,
					optionValue: option.value,
					routePoints: getSavedRoutePoints(block, edgeId)
				});
			}
		}
	}

	return edgeInputs;
}

function getSavedRoutePoints(block: LessonBlock, edgeId: string): LessonFlowRoutePoint[] | undefined {
	const points = sanitizeRoutePoints(block.graph?.edgeRoutes?.[edgeId]?.points ?? []);
	return points.length > 0 ? points : undefined;
}

function sanitizeRoutePoints(points: LessonBlockGraphRoutePoint[]): LessonFlowRoutePoint[] {
	return points
		.filter(
			(point) =>
				Number.isFinite(point.x) &&
				Number.isFinite(point.y) &&
				Math.abs(point.x) < 100_000 &&
				Math.abs(point.y) < 100_000
		)
		.slice(0, 12)
		.map((point) => ({
			x: Math.round(point.x),
			y: Math.round(point.y)
		}));
}

function createAutomaticRoutePoints(input: {
	edgeInput: { source: string; target: string };
	sourceNode?: LessonFlowNode;
	targetNode?: LessonFlowNode;
	nodes: LessonFlowNode[];
	sourceHandle: string;
	targetHandle: string;
}): LessonFlowRoutePoint[] {
	const { sourceNode, targetNode } = input;
	if (!sourceNode || !targetNode) return [];

	const sourcePosition = sourceNode.position;
	const targetPosition = targetNode.position;
	const isReturnEdge = sourcePosition.y > targetPosition.y + FLOW_NODE_GAP_Y * 0.45;
	if (!isReturnEdge) return [];

	const sourceX = getNodeHandleX(sourceNode, 'source', input.sourceHandle);
	const targetX = getNodeHandleX(targetNode, 'target', input.targetHandle);
	const sourceExitY = sourcePosition.y + FLOW_NODE_HEIGHT + RETURN_ROUTE_EXIT_GAP;
	const targetEntryY = Math.max(0, targetPosition.y - RETURN_ROUTE_ENTRY_GAP);
	const relevantRects = getRouteRelevantRects(
		input.nodes,
		Math.min(targetEntryY, sourceExitY),
		Math.max(targetEntryY, sourceExitY)
	);
	const baseLeftLane =
		Math.min(...relevantRects.map((rect) => rect.left), sourcePosition.x, targetPosition.x) -
		RETURN_ROUTE_LANE_GAP;
	const baseRightLane =
		Math.max(
			...relevantRects.map((rect) => rect.right),
			sourcePosition.x + FLOW_NODE_WIDTH,
			targetPosition.x + FLOW_NODE_WIDTH
		) + RETURN_ROUTE_LANE_GAP;
	const obstacleRects = relevantRects.filter(
		(rect) => rect.id !== input.edgeInput.source && rect.id !== input.edgeInput.target
	);

	const candidates = RETURN_ROUTE_EXTRA_LANE_GAPS.flatMap((extraGap) => [
		createReturnRouteCandidate({
			laneX: baseLeftLane - extraGap,
			sourceX,
			targetX,
			sourceExitY,
			targetEntryY,
			obstacleRects
		}),
		createReturnRouteCandidate({
			laneX: baseRightLane + extraGap,
			sourceX,
			targetX,
			sourceExitY,
			targetEntryY,
			obstacleRects
		})
	]);

	return candidates.sort((a, b) => a.score - b.score)[0]?.points ?? [];
}

function getNodeHandleX(
	node: LessonFlowNode,
	direction: 'source' | 'target',
	handleId: string
): number {
	const handles =
		direction === 'source'
			? node.data.outgoingHandles
			: node.data.incomingHandles.filter((handle) => handle.incomingKind !== 'add');
	const index = Math.max(
		0,
		handles.findIndex((handle) => handle.id === handleId)
	);
	const ratio = getHandleOffsetRatio(index, Math.max(handles.length, 1));
	return Math.round(node.position.x + FLOW_NODE_WIDTH * ratio);
}

function getHandleOffsetRatio(index: number, total: number): number {
	if (total <= 1) return 0.5;
	const horizontalPadding = total === 2 ? 0.28 : 0.16;
	const availableWidth = 1 - horizontalPadding * 2;
	return horizontalPadding + (index / (total - 1)) * availableWidth;
}

function getRouteRelevantRects(
	nodes: LessonFlowNode[],
	routeTop: number,
	routeBottom: number
): LessonFlowRouteRect[] {
	return nodes
		.map((node) => createRouteRect(node, RETURN_ROUTE_OBSTACLE_PADDING))
		.filter((rect) => rangesOverlap(rect.top, rect.bottom, routeTop, routeBottom));
}

function createRouteRect(node: LessonFlowNode, padding: number): LessonFlowRouteRect {
	return {
		id: node.id,
		left: node.position.x - padding,
		right: node.position.x + FLOW_NODE_WIDTH + padding,
		top: node.position.y - padding,
		bottom: node.position.y + FLOW_NODE_HEIGHT + padding
	};
}

function createReturnRouteCandidate(input: {
	laneX: number;
	sourceX: number;
	targetX: number;
	sourceExitY: number;
	targetEntryY: number;
	obstacleRects: LessonFlowRouteRect[];
}): { points: LessonFlowRoutePoint[]; score: number } {
	const points = sanitizeRoutePoints([
		{ x: input.sourceX, y: input.sourceExitY },
		{ x: input.laneX, y: input.sourceExitY },
		{ x: input.laneX, y: input.targetEntryY },
		{ x: input.targetX, y: input.targetEntryY }
	]);
	const intersections = countRouteRectIntersections(points, input.obstacleRects);
	const length = measureRouteLength(points);
	const laneDistance = Math.abs(input.laneX - input.sourceX) + Math.abs(input.laneX - input.targetX);

	return {
		points,
		score: intersections * 10_000 + length + laneDistance * 0.2
	};
}

function countRouteRectIntersections(
	points: LessonFlowRoutePoint[],
	rects: LessonFlowRouteRect[]
): number {
	let intersections = 0;
	for (let index = 1; index < points.length; index += 1) {
		const start = points[index - 1];
		const end = points[index];
		for (const rect of rects) {
			if (segmentIntersectsRect(start, end, rect)) {
				intersections += 1;
			}
		}
	}
	return intersections;
}

function segmentIntersectsRect(
	start: LessonFlowRoutePoint,
	end: LessonFlowRoutePoint,
	rect: LessonFlowRouteRect
): boolean {
	if (start.x === end.x) {
		return (
			start.x >= rect.left &&
			start.x <= rect.right &&
			rangesOverlap(start.y, end.y, rect.top, rect.bottom)
		);
	}

	if (start.y === end.y) {
		return (
			start.y >= rect.top &&
			start.y <= rect.bottom &&
			rangesOverlap(start.x, end.x, rect.left, rect.right)
		);
	}

	return false;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	const aMin = Math.min(aStart, aEnd);
	const aMax = Math.max(aStart, aEnd);
	const bMin = Math.min(bStart, bEnd);
	const bMax = Math.max(bStart, bEnd);
	return aMin <= bMax && bMin <= aMax;
}

function measureRouteLength(points: LessonFlowRoutePoint[]): number {
	let length = 0;
	for (let index = 1; index < points.length; index += 1) {
		const start = points[index - 1];
		const end = points[index];
		length += Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
	}
	return length;
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

function supportsDynamicIncomingHandles(): boolean {
	return true;
}

function createIncomingHandleState(
	block: LessonBlock,
	edgeIds: string[]
): LessonFlowIncomingHandleState {
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
