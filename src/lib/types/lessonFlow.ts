import type { Edge, Node } from '@xyflow/svelte';
import type { LessonBlockKind, LessonConditionOperator, LessonDefinition } from './lesson';

export type LessonFlowEdgeType = 'next' | 'branch' | 'choice-option';

export interface LessonFlowNodeData extends Record<string, unknown> {
	blockId: string;
	title: string;
	kind: LessonBlockKind;
	kindLabel: string;
	isEntry: boolean;
	incomingCount: number;
	outgoingCount: number;
	summary: string;
}

export type LessonFlowNode = Node<LessonFlowNodeData, 'lesson-block'>;

export interface LessonFlowEdgeData extends Record<string, unknown> {
	edgeType: LessonFlowEdgeType;
	sourceBlockId: string;
	targetBlockId: string;
	label: string;
	branchIndex?: number;
	optionId?: string;
	optionValue?: string;
	conditionSource?: string;
	conditionOperator?: LessonConditionOperator;
	conditionValue?: string | number | boolean | null;
}

export type LessonFlowEdge = Edge<LessonFlowEdgeData, 'smoothstep'>;

export interface LessonFlowGraph {
	nodes: LessonFlowNode[];
	edges: LessonFlowEdge[];
}

export interface LessonFlowSavePayload {
	definition: LessonDefinition;
}
