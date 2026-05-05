export type LearningEvidenceMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface LearningEvidenceStudentRef {
	userId: string;
	username: string;
	email: string;
	alias?: string;
}

export type LearningEvidenceProgressStatus =
	| 'not_started'
	| 'in_progress'
	| 'completed'
	| 'abandoned';

export interface LearningEvidenceRosterEntry extends LearningEvidenceStudentRef {
	role: string;
	level: number;
	isEnrolled: boolean;
}

export interface LearningEvidenceActivityContext {
	activityId: string;
	courseId: string | null;
	activityType: string;
	name: string;
	description: string | null;
	systemPrompt: string | null;
	llmRole: string | null;
	llmInstructions: string | null;
	llmContext: string | null;
}

export interface LearningEvidenceTextPart {
	kind: 'text';
	text: string;
}

export interface LearningEvidenceToolCallPart {
	kind: 'tool-call';
	toolCallId: string;
	toolName: string;
	toolDisplayName: string;
	args: Record<string, unknown>;
	status: string | null;
	requiresConfirmation: boolean;
}

export interface LearningEvidenceToolResultPart {
	kind: 'tool-result';
	toolCallId: string | null;
	toolName: string;
	toolDisplayName: string;
	status: string | null;
	result: unknown;
	text: string | null;
	errorMessage: string | null;
	durationMs: number | null;
}

export interface LearningEvidenceUIComponentPart {
	kind: 'ui-component';
	instanceId: string;
	componentKey: string;
	props: Record<string, unknown>;
	interactive: boolean;
}

export interface LearningEvidenceUIResponsePart {
	kind: 'ui-response';
	instanceId: string;
	componentKey: string;
	payload: unknown;
	respondedAt: string | null;
	score: number | null;
}

export type LearningEvidenceMessagePart =
	| LearningEvidenceTextPart
	| LearningEvidenceToolCallPart
	| LearningEvidenceToolResultPart
	| LearningEvidenceUIComponentPart
	| LearningEvidenceUIResponsePart;

export interface LearningEvidenceTranscriptMessage {
	id: string;
	role: LearningEvidenceMessageRole;
	createdAt: string;
	displayText: string;
	parts: LearningEvidenceMessagePart[];
	source: 'chat_message' | 'agent_message' | 'agent_tool_call' | 'agent_ui_instance';
}

export interface LearningEvidenceTranscriptSession {
	student: LearningEvidenceStudentRef;
	chatId: string;
	sessionStartedAt: string;
	sessionUpdatedAt: string;
	messageCount: number;
	learnerMessageCount: number;
	assistantMessageCount: number;
	toolCallCount: number;
	uiResponseCount: number;
	messages: LearningEvidenceTranscriptMessage[];
}

export interface LearningEvidenceStudentSummary extends LearningEvidenceStudentRef {
	progressStatus: LearningEvidenceProgressStatus;
	sessionCount: number;
	totalMessages: number;
	learnerMessageCount: number;
	assistantMessageCount: number;
	toolCallCount: number;
	uiResponseCount: number;
	averageLearnerMessageLength: number;
	startedAt: string | null;
	firstActivityAt: string | null;
	lastActivityAt: string | null;
	completedAt: string | null;
	attemptsCount: number;
	timeSpentSeconds: number;
}

export interface LearningEvidenceOverview {
	activity: LearningEvidenceActivityContext;
	totalEnrolledStudents: number;
	studentsWithEvidenceCount: number;
	totalSessions: number;
	totalMessages: number;
	lastActivityAt: string | null;
	studentSummaries: LearningEvidenceStudentSummary[];
}

export interface LearningEvidenceAccessContext {
	actorUserId: string;
	actorHighestRoleLevel?: number;
}

export interface LearningEvidenceTranscriptQuery {
	activityId: string;
	studentIds?: string[];
	chatIds?: string[];
	search?: string;
	dateFrom?: string | Date;
	dateTo?: string | Date;
	includeRoles?: LearningEvidenceMessageRole[];
}
