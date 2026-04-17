import test from 'node:test';
import assert from 'node:assert/strict';

import type { LessonDefinition } from '../types/lesson';
import {
	applyLessonFlowGraph,
	createLessonFlowGraph,
	getLessonFlowChoiceHandleId,
	getLessonFlowBranchEdgeId,
	getLessonFlowIncomingHandleId,
	getLessonFlowChoiceEdgeId,
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
					mode: 'guided_turn',
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
