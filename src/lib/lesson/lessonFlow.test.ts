import test from 'node:test';
import assert from 'node:assert/strict';

import type { LessonDefinition } from '../types/lesson';
import {
	applyLessonFlowGraph,
	createLessonFlowGraph,
	getLessonFlowBranchEdgeId,
	getLessonFlowChoiceHandleId,
	getLessonFlowChoiceEdgeId,
	getLessonFlowIncomingAddHandleId,
	getLessonFlowIncomingHandleId,
	getLessonFlowNextHandleId,
	getLessonFlowNextEdgeId
} from './lessonFlow';
import { LessonService } from '../server/lesson/LessonService';
import { LessonServiceError } from '../server/lesson/LessonServiceError';

function makeDefinition(): LessonDefinition {
	return {
		version: '2',
		entryBlockId: 'intro',
		blocks: [
			{
				id: 'intro',
				kind: 'content',
				title: 'Intro',
				body: 'Hola',
				next: 'decision',
				graph: {
					position: { x: 40, y: 60 }
				}
			},
			{
				id: 'decision',
				kind: 'choice',
				title: 'Decide',
				body: 'Escoge',
				outputKey: 'route',
				options: [
					{ id: 'left', label: 'Izquierda', value: 'left', targetBlockId: 'agent' },
					{ id: 'right', label: 'Derecha', value: 'right', targetBlockId: 'end' }
				]
			},
			{
				id: 'agent',
				kind: 'agent',
				title: 'Tutor',
				body: 'Dialoga',
				next: 'end',
				branches: [
					{
						label: 'Volver',
						targetBlockId: 'intro',
						condition: {
							source: 'session.attemptNumber',
							operator: 'gte',
							value: 2
						}
					}
				],
				agentConfig: {
					interactionMode: 'single_turn',
					executionTrigger: 'on_user_submit',
					autoStartOnEnter: true,
					promptTemplate: 'Ayuda'
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
}

test('createLessonFlowGraph serializes nodes and edges with correct metadata', () => {
	const graph = createLessonFlowGraph(makeDefinition());
	const introNode = graph.nodes.find((node) => node.id === 'intro');
	const decisionNode = graph.nodes.find((node) => node.id === 'decision');
	const introNextEdge = graph.edges.find((edge) => edge.id === getLessonFlowNextEdgeId('intro'));
	const leftChoiceEdge = graph.edges.find(
		(edge) => edge.id === getLessonFlowChoiceEdgeId('decision', 'left')
	);

	assert.equal(graph.nodes.length, 4);
	assert.equal(graph.edges.length, 5);
	assert.equal(graph.nodes[0]?.position.x, 40);
	assert.ok(graph.nodes.every((node) => node.type === 'lesson-block'));
	assert.ok(graph.edges.some((edge) => edge.id === getLessonFlowNextEdgeId('intro')));
	assert.ok(graph.edges.some((edge) => edge.id === getLessonFlowChoiceEdgeId('decision', 'left')));
	assert.ok(graph.edges.some((edge) => edge.id === getLessonFlowBranchEdgeId('agent', 0)));
	assert.equal(introNode?.sourcePosition, 'bottom');
	assert.equal(decisionNode?.targetPosition, 'top');
	assert.deepEqual(
		introNode?.data.outgoingHandles.map((handle) => handle.id),
		[getLessonFlowNextHandleId()]
	);
	assert.ok(
		decisionNode?.data.outgoingHandles.some(
			(handle) => handle.id === getLessonFlowChoiceHandleId('left')
		)
	);
	assert.equal(introNextEdge?.sourceHandle, getLessonFlowNextHandleId());
	assert.equal(
		introNextEdge?.targetHandle,
		getLessonFlowIncomingHandleId(getLessonFlowNextEdgeId('intro'))
	);
	assert.equal(leftChoiceEdge?.sourceHandle, getLessonFlowChoiceHandleId('left'));
	const returnBranchEdge = graph.edges.find(
		(edge) => edge.id === getLessonFlowBranchEdgeId('agent', 0)
	);
	if (!returnBranchEdge?.data) throw new Error('Missing return branch edge data');
	assert.equal(returnBranchEdge.data.routeMode, 'auto');
	assert.ok(returnBranchEdge.data.routePoints.length > 0);
	assert.equal(
		returnBranchEdge.data.routePoints.at(-1)?.x,
		166,
		'expected a single occupied incoming connection to target the center of the node'
	);
	assert.deepEqual(
		introNode?.data.incomingHandles.map((handle) => handle.id),
		[
			getLessonFlowIncomingHandleId(getLessonFlowBranchEdgeId('agent', 0)),
			getLessonFlowIncomingAddHandleId('intro')
		]
	);
	assert.deepEqual(
		decisionNode?.data.incomingHandles.map((handle) => handle.id),
		[
			getLessonFlowIncomingHandleId(getLessonFlowNextEdgeId('intro')),
			getLessonFlowIncomingAddHandleId('decision')
		]
	);
});

test('createLessonFlowGraph resets return routes through the clearest side lane', () => {
	const definition = makeDefinition();
	for (const block of definition.blocks) {
		if (block.id === 'intro') {
			block.graph = { position: { x: 400, y: 80 } };
		}
		if (block.id === 'decision') {
			block.graph = { position: { x: 80, y: 300 } };
		}
		if (block.id === 'agent') {
			block.graph = { position: { x: 400, y: 520 } };
		}
		if (block.id === 'end') {
			block.graph = { position: { x: 400, y: 780 } };
		}
	}

	const graph = createLessonFlowGraph(definition);
	const returnBranchEdge = graph.edges.find(
		(edge) => edge.id === getLessonFlowBranchEdgeId('agent', 0)
	);
	if (!returnBranchEdge?.data) throw new Error('Missing return branch edge data');

	assert.equal(returnBranchEdge.data.routeMode, 'auto');
	assert.equal(returnBranchEdge.data.routePoints.length, 4);
	assert.ok(
		returnBranchEdge.data.routePoints[1]?.x > 650,
		'expected the automatic route to avoid the left-side obstacle via a right lane'
	);
	assert.equal(returnBranchEdge.data.routePoints[1]?.x, returnBranchEdge.data.routePoints[2]?.x);
});

test('applyLessonFlowGraph preserves and updates graph positions', () => {
	const definition = makeDefinition();
	const graph = createLessonFlowGraph(definition);
	const movedNodes = graph.nodes.map((node) =>
		node.id === 'decision' ? { ...node, position: { x: 640, y: 180 } } : node
	);

	const updated = applyLessonFlowGraph(definition, { nodes: movedNodes, edges: graph.edges });
	const movedBlock = updated.blocks.find((block) => block.id === 'decision');

	assert.deepEqual(movedBlock?.graph?.position, { x: 640, y: 180 });
	assert.deepEqual(updated.blocks.find((block) => block.id === 'intro')?.graph?.position, {
		x: 40,
		y: 60
	});
});

test('fallback layout stacks blocks vertically from the entry block', () => {
	const definition = makeDefinition();
	for (const block of definition.blocks) {
		delete block.graph;
	}

	const graph = createLessonFlowGraph(definition);
	const intro = graph.nodes.find((node) => node.id === 'intro');
	const decision = graph.nodes.find((node) => node.id === 'decision');
	const agent = graph.nodes.find((node) => node.id === 'agent');

	assert.equal(intro?.position.y, 0);
	assert.ok((decision?.position.y ?? 0) > (intro?.position.y ?? 0));
	assert.ok((agent?.position.y ?? 0) >= (decision?.position.y ?? 0));
});

test('applyLessonFlowGraph reconstructs next, branch and choice targets after reconnecting edges', () => {
	const definition = makeDefinition();
	const graph = createLessonFlowGraph(definition);
	const nextEdges = graph.edges.map((edge) => {
		if (edge.id === getLessonFlowNextEdgeId('intro')) {
			return { ...edge, target: 'agent' };
		}

		if (edge.id === getLessonFlowBranchEdgeId('agent', 0)) {
			return { ...edge, target: 'end' };
		}

		if (edge.id === getLessonFlowChoiceEdgeId('decision', 'left')) {
			return { ...edge, target: 'end' };
		}

		return edge;
	});

	const updated = applyLessonFlowGraph(definition, { nodes: graph.nodes, edges: nextEdges });
	const intro = updated.blocks.find((block) => block.id === 'intro');
	const agent = updated.blocks.find((block) => block.id === 'agent');
	const decision = updated.blocks.find((block) => block.id === 'decision');

	assert.equal(intro?.kind, 'content');
	assert.equal(intro?.next, 'agent');
	assert.equal(agent?.kind, 'agent');
	assert.equal(agent?.branches?.[0]?.targetBlockId, 'end');
	assert.equal(decision?.kind, 'choice');
	assert.equal(decision?.options[0]?.targetBlockId, 'end');

	assert.doesNotThrow(() => LessonService.validateDefinition(updated));
});

test('reconnected graph still respects entry block validation and rejects missing targets', () => {
	const definition = makeDefinition();
	const graph = createLessonFlowGraph(definition);
	const brokenEdges = graph.edges.map((edge) =>
		edge.id === getLessonFlowNextEdgeId('intro') ? { ...edge, target: 'missing' } : edge
	);

	const updated = applyLessonFlowGraph(definition, { nodes: graph.nodes, edges: brokenEdges });

	assert.throws(
		() => LessonService.validateDefinition(updated),
		(error) =>
			error instanceof LessonServiceError &&
			error.message.includes('missing') &&
			error.message.includes('inexistente')
	);
});

test('dynamic incoming handles preserve saved order and expose an add socket', () => {
	const definition = makeDefinition();
	const endBlock = definition.blocks.find((block) => block.id === 'end');
	if (!endBlock) throw new Error('Missing end block');

	endBlock.graph = {
		...(endBlock.graph ?? {}),
		incomingOrder: [
			getLessonFlowNextEdgeId('agent'),
			getLessonFlowChoiceEdgeId('decision', 'right')
		]
	};

	const graph = createLessonFlowGraph(definition);
	const endNode = graph.nodes.find((node) => node.id === 'end');
	const endIncomingHandles = endNode?.data.incomingHandles ?? [];
	const agentEdge = graph.edges.find((edge) => edge.id === getLessonFlowNextEdgeId('agent'));
	const choiceEdge = graph.edges.find(
		(edge) => edge.id === getLessonFlowChoiceEdgeId('decision', 'right')
	);

	assert.deepEqual(
		endIncomingHandles.map((handle) => handle.id),
		[
			getLessonFlowIncomingHandleId(getLessonFlowNextEdgeId('agent')),
			getLessonFlowIncomingHandleId(getLessonFlowChoiceEdgeId('decision', 'right')),
			getLessonFlowIncomingAddHandleId('end')
		]
	);
	assert.equal(
		agentEdge?.targetHandle,
		getLessonFlowIncomingHandleId(getLessonFlowNextEdgeId('agent'))
	);
	assert.equal(
		choiceEdge?.targetHandle,
		getLessonFlowIncomingHandleId(getLessonFlowChoiceEdgeId('decision', 'right'))
	);
});

test('missing incomingOrder entries are appended without breaking the graph', () => {
	const definition = makeDefinition();
	const endBlock = definition.blocks.find((block) => block.id === 'end');
	if (!endBlock) throw new Error('Missing end block');

	endBlock.graph = {
		...(endBlock.graph ?? {}),
		incomingOrder: [getLessonFlowChoiceEdgeId('decision', 'right')]
	};

	const graph = createLessonFlowGraph(definition);
	const endNode = graph.nodes.find((node) => node.id === 'end');

	assert.deepEqual(
		endNode?.data.incomingHandles.map((handle) => handle.id),
		[
			getLessonFlowIncomingHandleId(getLessonFlowChoiceEdgeId('decision', 'right')),
			getLessonFlowIncomingHandleId(getLessonFlowNextEdgeId('agent')),
			getLessonFlowIncomingAddHandleId('end')
		]
	);
});

test('applyLessonFlowGraph persists incomingOrder from dynamic incoming handles', () => {
	const definition = makeDefinition();
	const graph = createLessonFlowGraph(definition);
	const decisionNode = graph.nodes.find((node) => node.id === 'decision');
	if (!decisionNode) throw new Error('Missing decision node');

	decisionNode.data.incomingHandles = [
		{
			id: getLessonFlowIncomingHandleId(getLessonFlowBranchEdgeId('agent', 0)),
			label: 'Entrada 1',
			edgeType: 'incoming',
			incomingKind: 'occupied',
			edgeId: getLessonFlowBranchEdgeId('agent', 0)
		},
		{
			id: getLessonFlowIncomingHandleId(getLessonFlowNextEdgeId('intro')),
			label: 'Entrada 1',
			edgeType: 'incoming',
			incomingKind: 'occupied',
			edgeId: getLessonFlowNextEdgeId('intro')
		},
		{
			id: getLessonFlowIncomingAddHandleId('decision'),
			label: 'Añadir entrada',
			edgeType: 'incoming',
			incomingKind: 'add'
		}
	];

	const updated = applyLessonFlowGraph(definition, graph);
	const updatedDecision = updated.blocks.find((block) => block.id === 'decision');

	assert.deepEqual(updatedDecision?.graph?.incomingOrder, [
		getLessonFlowBranchEdgeId('agent', 0),
		getLessonFlowNextEdgeId('intro')
	]);
});

test('applyLessonFlowGraph persists manual edge route points and reloads them', () => {
	const definition = makeDefinition();
	const graph = createLessonFlowGraph(definition);
	const branchEdgeId = getLessonFlowBranchEdgeId('agent', 0);
	const routedEdges = graph.edges.map((edge) =>
		edge.id === branchEdgeId
			? {
					...edge,
					data: {
						...edge.data!,
						routeMode: 'manual' as const,
						routePoints: [
							{ x: 120.4, y: 240.6 },
							{ x: 120.4, y: 48.2 }
						],
						isAutoRouted: false
					}
				}
			: edge
	);

	const updated = applyLessonFlowGraph(definition, { nodes: graph.nodes, edges: routedEdges });
	const updatedAgent = updated.blocks.find((block) => block.id === 'agent');

	assert.deepEqual(updatedAgent?.graph?.edgeRoutes?.[branchEdgeId]?.points, [
		{ x: 120, y: 241 },
		{ x: 120, y: 48 }
	]);

	const reloadedGraph = createLessonFlowGraph(updated);
	const reloadedBranchEdge = reloadedGraph.edges.find((edge) => edge.id === branchEdgeId);

	if (!reloadedBranchEdge?.data) throw new Error('Missing reloaded branch edge data');
	assert.equal(reloadedBranchEdge.data.routeMode, 'manual');
	assert.deepEqual(reloadedBranchEdge.data.routePoints, [
		{ x: 120, y: 241 },
		{ x: 120, y: 48 }
	]);
});
