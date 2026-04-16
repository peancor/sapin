export const lessonBlockKinds = ['content', 'choice', 'agent', 'end'] as const;
export type LessonBlockKind = (typeof lessonBlockKinds)[number];

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

export interface LessonVariableRef {
	path: string;
	source: 'session' | 'block-output';
}

export interface LessonOutputField {
	key: string;
	type: LessonOutputFieldType;
	description?: string;
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
	version: '1';
	entryBlockId: string;
	blocks: LessonBlock[];
}

export interface LessonAvailableVariable {
	path: string;
	label: string;
	description: string;
}
