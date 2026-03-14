export type ActivityDebuggerFieldOrigin =
	| 'stored'
	| 'derived_current'
	| 'usage_log'
	| 'unavailable';

export type ActivityDebuggerActivityType = 'chat' | 'agent';
export type ActivityDebuggerSessionStatus = 'completed' | 'pending' | 'attention';
export type ActivityDebuggerTimelineEventKind =
	| 'message'
	| 'tool_call'
	| 'tool_result'
	| 'ui_component'
	| 'ui_response'
	| 'usage'
	| 'session_marker'
	| 'config_snapshot';

export interface ActivityDebuggerFilters {
	courseId?: string;
	type?: ActivityDebuggerActivityType | 'all';
	search?: string;
	dateFrom?: string | null;
	dateTo?: string | null;
	onlyErrors?: boolean;
	onlyToolFailures?: boolean;
	onlyHighUsage?: boolean;
	onlyPendingSessions?: boolean;
}

export interface ActivityDebuggerSessionFilters {
	search?: string;
	dateFrom?: string | null;
	dateTo?: string | null;
	status?: 'all' | ActivityDebuggerSessionStatus;
	onlyErrors?: boolean;
	onlyToolFailures?: boolean;
	onlyHighUsage?: boolean;
}

export interface ActivityDebuggerCourseOption {
	id: string | null;
	name: string;
	status: string | null;
	activityCount: number;
}

export interface ActivityDebuggerActivitySummary {
	activityId: string;
	activityName: string;
	activityType: ActivityDebuggerActivityType;
	activityStatus: string;
	courseId: string | null;
	courseName: string | null;
	courseStatus: string | null;
	modelName: string | null;
	ragEnabled: boolean;
	sessionCount: number;
	totalMessages: number;
	totalTokens: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalEstimatedCost: number;
	lastActivityAt: string | null;
	hasFailures: boolean;
	hasToolFailures: boolean;
	hasPendingSessions: boolean;
	pendingSessionCount: number;
	failedUsageCount: number;
	failedToolCallCount: number;
	highUsage: boolean;
}

export interface ActivityDebuggerPromptValue {
	label: string;
	value: string | null;
	origin: ActivityDebuggerFieldOrigin;
	note?: string | null;
}

export interface ActivityDebuggerPromptSnapshot {
	storedSystemPrompt: ActivityDebuggerPromptValue;
	storedRole: ActivityDebuggerPromptValue;
	storedInstructions: ActivityDebuggerPromptValue;
	storedContext: ActivityDebuggerPromptValue;
	derivedCurrentSystemPrompt: ActivityDebuggerPromptValue;
}

export interface ActivityDebuggerUsageSummary {
	requestCount: number;
	successCount: number;
	failureCount: number;
	totalTokens: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalEstimatedCost: number;
	averageDurationMs: number;
	lastModelName: string | null;
}

export interface ActivityDebuggerSessionSummary {
	chatId: string;
	userId: string;
	username: string;
	email: string;
	alias?: string;
	image?: string | null;
	startedAt: string;
	lastActivityAt: string;
	status: ActivityDebuggerSessionStatus;
	isFinalized: boolean;
	hasUsageErrors: boolean;
	hasToolFailures: boolean;
	totalMessages: number;
	learnerMessageCount: number;
	assistantMessageCount: number;
	toolCallCount: number;
	uiResponseCount: number;
	totalTokens: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalEstimatedCost: number;
	lastModelName: string | null;
	alerts: string[];
}

export interface ActivityDebuggerTimelineEvent {
	id: string;
	kind: ActivityDebuggerTimelineEventKind;
	source: string;
	timestamp: string;
	title: string;
	summary: string;
	role?: string | null;
	status?: string | null;
	raw: unknown;
	metrics?: Record<string, unknown>;
	relatedIds?: Record<string, string | null>;
}

export interface ActivityDebuggerRawSection {
	id: string;
	label: string;
	description?: string;
	data: unknown;
}

export interface ActivityDebuggerActivityDetail {
	activityId: string;
	activityName: string;
	activityType: ActivityDebuggerActivityType;
	activityStatus: string;
	description: string | null;
	courseId: string | null;
	courseName: string | null;
	courseStatus: string | null;
	modelName: string | null;
	ragEnabled: boolean;
	temperature: number | null;
	topP: number | null;
	maxTokens: number | null;
	systemPrompt: string | null;
	llmRole: string | null;
	llmInstructions: string | null;
	llmContext: string | null;
	metadata: unknown;
	ragConfig: unknown;
	tools: Array<{
		id: string;
		name: string;
		displayName: string;
		category: string;
		riskLevel: string;
		requiresConfirmation: boolean;
	}>;
	uiComponents: Array<{
		id: string;
		componentKey: string;
		messageId: string;
		createdAt: string;
	}>;
	prompts: ActivityDebuggerPromptSnapshot;
	usage: ActivityDebuggerUsageSummary;
	sessions: ActivityDebuggerSessionSummary[];
	rawSections: ActivityDebuggerRawSection[];
}

export interface ActivityDebuggerSessionDetail {
	activity: ActivityDebuggerActivityDetail;
	session: ActivityDebuggerSessionSummary;
	student: {
		userId: string;
		username: string;
		email: string;
		alias?: string;
		image?: string | null;
	};
	chat: {
		id: string;
		title: string | null;
		createdAt: string;
		updatedAt: string;
		metadata: unknown;
	};
	prompts: ActivityDebuggerPromptSnapshot;
	usage: ActivityDebuggerUsageSummary & {
		logs: Array<{
			id: string;
			createdAt: string;
			modelName: string | null;
			inputTokens: number;
			outputTokens: number;
			totalTokens: number;
			estimatedCost: number;
			durationMs: number | null;
			success: boolean;
			errorMessage: string | null;
			metadata: unknown;
		}>;
	};
	timeline: ActivityDebuggerTimelineEvent[];
	rawSections: ActivityDebuggerRawSection[];
}
