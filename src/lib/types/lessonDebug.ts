import type { AgentDisplayMessage } from './agent';
import type {
	LessonBlock,
	LessonBlockGraphSummary,
	LessonBlockKind
} from './lesson';

export type LessonDebugPreviewMode = 'draft' | 'published';
export type LessonDebugVisualState = 'current' | 'completed' | 'visited' | 'pending';

export interface LessonDebugSessionOption {
	id: string;
	attemptNumber: number;
	status: string;
	startedAt: Date;
	lastActiveAt: Date;
	completedAt: Date | null;
	isSelected: boolean;
}

export interface LessonDebugBlockSummary {
	blockId: string;
	title: string;
	kind: LessonBlockKind;
	isEntry: boolean;
	isCurrent: boolean;
	isSelected: boolean;
	visualState: LessonDebugVisualState;
	visitCount: number;
	completed: boolean;
	revisited: boolean;
	hasAlerts: boolean;
	latestVisitStatus: string | null;
	graph: LessonBlockGraphSummary;
}

export interface LessonDebugTransitionEvaluation {
	id: string;
	kind: 'next' | 'branch' | 'choice-option';
	label: string | null;
	targetBlockId: string;
	matches: boolean;
	reason: string;
	source: string | null;
	operator: string | null;
	expectedValue: string | number | boolean | null;
	actualValue: unknown;
}

export interface LessonDebugVisitRecord {
	visitId: string;
	visitNumber: number;
	blockId: string;
	status: string;
	enteredAt: Date;
	completedAt: Date | null;
	chatId: string | null;
	lastChoiceValue: string | null;
	outputs: Record<string, unknown>;
	metadata: Record<string, unknown>;
}

export interface LessonDebugEventRecord {
	id: string;
	eventType: string;
	blockId: string | null;
	visitId: string | null;
	createdAt: Date;
	payload: Record<string, unknown>;
}

export interface LessonDebugBasicChatMessage {
	id: string;
	type: string;
	content: string;
	createdAt: Date;
}

export interface LessonDebugAgentTranscript {
	mode: 'agent' | 'basic';
	chatId: string;
	runtimeMessages: AgentDisplayMessage[];
	basicMessages: LessonDebugBasicChatMessage[];
}

export interface LessonDebugInspectorState {
	blockId: string;
	originalBlock: LessonBlock;
	resolvedBlock: LessonBlock;
	graph: LessonBlockGraphSummary;
	state: {
		status: string | null;
		visitCount: number;
		enteredAt: Date | null;
		completedAt: Date | null;
		lastVisitId: string | null;
		lastChoiceValue: string | null;
		chatId: string | null;
		outputs: Record<string, unknown>;
		metadata: Record<string, unknown>;
	} | null;
	latestVisit: LessonDebugVisitRecord | null;
	visits: LessonDebugVisitRecord[];
	transitions: LessonDebugTransitionEvaluation[];
	agentTranscript: LessonDebugAgentTranscript | null;
	sessionEvents: LessonDebugEventRecord[];
}

export interface LessonDebugSnapshot {
	activity: {
		id: string;
		name: string;
		description: string | null;
		status: string;
	};
	previewMode: LessonDebugPreviewMode;
	sessionOptions: LessonDebugSessionOption[];
	currentBlockId: string;
	selectedBlockId: string;
	blockSummaries: LessonDebugBlockSummary[];
	inspector: LessonDebugInspectorState;
	events: LessonDebugEventRecord[];
	runtimeView: unknown;
}
