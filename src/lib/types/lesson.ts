export const lessonBlockKinds = ['content', 'choice', 'agent', 'end'] as const;
export type LessonBlockKind = (typeof lessonBlockKinds)[number];

export const lessonDefinitionVersions = ['1', '2'] as const;
export type LessonDefinitionVersion = (typeof lessonDefinitionVersions)[number];

export const lessonSessionPolicies = ['resume_latest', 'always_new_attempt'] as const;
export type LessonSessionPolicy = (typeof lessonSessionPolicies)[number];

export const lessonAttemptStatuses = ['active', 'completed', 'restarted', 'abandoned'] as const;
export type LessonAttemptStatus = (typeof lessonAttemptStatuses)[number];

export const lessonConditionOperators = [
	'equals',
	'not_equals',
	'contains',
	'exists',
	'not_exists',
	'gt',
	'gte',
	'lt',
	'lte'
] as const;
export type LessonConditionOperator = (typeof lessonConditionOperators)[number];

export const lessonOutputFieldTypes = ['string', 'number', 'boolean', 'json'] as const;
export type LessonOutputFieldType = (typeof lessonOutputFieldTypes)[number];

export const lessonReferenceNamespaces = ['session', 'state', 'outputs'] as const;
export type LessonReferenceNamespace = (typeof lessonReferenceNamespaces)[number];

export interface LessonVariableRef {
	path: string;
	source: 'session' | 'block-state' | 'block-output';
}

export interface LessonOutputField {
	key: string;
	type: LessonOutputFieldType;
	description?: string;
}

export interface LessonBlockGraphMeta {
	position?: {
		x: number;
		y: number;
	};
	incomingOrder?: string[];
}

export interface LessonBlockExposure {
	outputs?: LessonOutputField[];
}

export interface LessonAssetRef {
	fileId: string;
	kind?: 'image' | 'video' | 'audio' | 'file';
	caption?: string;
}

export interface LessonTransitionCondition {
	source: string;
	operator: LessonConditionOperator;
	value?: string | number | boolean | null;
}

export interface LessonTransition {
	id?: string;
	label?: string;
	targetBlockId: string;
	condition?: LessonTransitionCondition;
}

interface LessonBlockBase {
	id: string;
	kind: LessonBlockKind;
	title: string;
	next?: string | null;
	branches?: LessonTransition[];
	graph?: LessonBlockGraphMeta;
	exposure?: LessonBlockExposure;
}

export interface LessonContentBlock extends LessonBlockBase {
	kind: 'content';
	body: string;
	continueLabel?: string;
	assetRefs?: LessonAssetRef[];
}

export interface LessonChoiceOption {
	id: string;
	label: string;
	value: string;
	description?: string;
	targetBlockId: string;
}

export interface LessonChoiceBlock extends LessonBlockBase {
	kind: 'choice';
	body?: string;
	options: LessonChoiceOption[];
	outputKey?: string;
}

export interface LessonAgentConfig {
	mode: 'guided_turn' | 'mini_chat';
	model?: string | null;
	systemPrompt?: string | null;
	promptTemplate: string;
	placeholder?: string;
	submitLabel?: string;
	continueLabel?: string;
	initialAssistantMessage?: string;
	maxTurns?: number | null;
	outputSchema?: LessonOutputField[];
}

export interface LessonAgentBlock extends LessonBlockBase {
	kind: 'agent';
	body?: string;
	agentConfig: LessonAgentConfig;
	requiresResponse?: boolean;
}

export interface LessonEndBlock extends LessonBlockBase {
	kind: 'end';
	body?: string;
	ctaLabel?: string;
}

export type LessonBlock =
	| LessonContentBlock
	| LessonChoiceBlock
	| LessonAgentBlock
	| LessonEndBlock;

export interface LessonDefinition {
	version: '2';
	entryBlockId: string;
	blocks: LessonBlock[];
}

export interface LessonAvailableVariable {
	path: string;
	label: string;
	description: string;
	namespace?: LessonReferenceNamespace;
	blockId?: string;
	source?: 'session' | 'block-state' | 'block-output';
}

export interface LessonBlockContractField {
	path: string;
	key: string;
	label: string;
	description: string;
	type: LessonOutputFieldType | 'date' | 'integer' | 'status';
	source: 'system' | 'public';
	namespace: Exclude<LessonReferenceNamespace, 'session'>;
	availableWhen: 'always' | 'after_visit' | 'after_completion';
}

export interface LessonBlockContract {
	blockId: string;
	blockTitle: string;
	blockKind: LessonBlockKind;
	state: LessonBlockContractField[];
	outputs: LessonBlockContractField[];
}

export interface LessonBlockReferenceGroups {
	blockId: string;
	blockTitle: string;
	state: LessonAvailableVariable[];
	outputs: LessonAvailableVariable[];
}

export interface LessonBlockGraphSummary {
	blockId: string;
	incomingBlockIds: string[];
	outgoingBlockIds: string[];
	contracts: LessonBlockContract;
}
