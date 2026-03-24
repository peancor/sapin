// ============================================
// TIPOS CORE DEL SISTEMA AGÉNTICO
// ============================================

// ─── Stream Parts (Server → Client via SSE) ───

export type AgentStreamPart =
	| TextDeltaPart
	| ToolCallStartPart
	| ToolCallDeltaPart
	| ToolResultPart
	| ToolConfirmRequiredPart
	| UIComponentPart
	| StatusPart
	| ErrorPart
	| DonePart;

export interface TextDeltaPart {
	type: 'text-delta';
	text: string;
}

export interface ToolCallStartPart {
	type: 'tool-call-start';
	toolCallId: string;
	toolName: string;
	toolDisplayName: string;
	args: Record<string, unknown>;
}

export interface ToolCallDeltaPart {
	type: 'tool-call-delta';
	toolCallId: string;
	status: 'executing' | 'streaming';
	progressText?: string;
}

export interface ToolResultPart {
	type: 'tool-result';
	toolCallId: string;
	toolName: string;
	result: unknown;
	displayResult?: string;
	status: 'completed' | 'failed';
	durationMs: number;
	errorMessage?: string;
}

export interface ToolConfirmRequiredPart {
	type: 'tool-confirm-required';
	toolCallId: string;
	toolName: string;
	toolDisplayName: string;
	args: Record<string, unknown>;
	riskLevel: 'low' | 'medium' | 'high';
	confirmationMessage: string;
}

export interface UIComponentPart {
	type: 'ui-component';
	instanceId: string;
	componentKey: string;
	props: Record<string, unknown>;
	interactive: boolean;
}

export interface StatusPart {
	type: 'status';
	status: 'thinking' | 'calling-tools' | 'finalizing';
	message?: string;
}

export interface ErrorPart {
	type: 'error';
	code: string;
	message: string;
}

export interface DonePart {
	type: 'done';
	usage: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		toolCallsCount: number;
		estimatedCost?: number;
	};
	finishReason: string;
}

// ─── Contexto de ejecución del agente ───

export interface AgentContext {
	userId: string;
	courseId?: string;
	chatId: string;
	activityId: string; // ID de interactiveLearningAgent
	activityConfig: AgentActivityConfig;
	enabledTools: ToolDefinitionResolved[];
	enabledUIComponentKeys: string[];
	messageHistory: AgentHistoryMessage[];
}

export interface AgentActivityConfig {
	llmModel?: string | null;
	llmRole?: string | null;
	llmInstructions?: string | null;
	llmContext?: string | null;
	systemPrompt?: string | null;
	temperature?: number | null;
	maxTokens?: number | null;
	topP?: number | null;
	maxToolRoundtrips: number;
	parallelToolCalls: boolean;
	toolChoice: 'auto' | 'required' | 'none';
	finalizationEnabled: boolean;
	finalizationToolName: string;
	finalizationHandler: 'mark_complete_and_notify' | 'mark_complete_only' | 'notify_only';
	finalizationConfig?: string | null;
	requireFinalizationToolCall: boolean;
	ragEnabled?: boolean | null;
	ragCollectionName?: string | null;
	ragConfig?: string | null;
}

// Herramienta resuelta con toda su info
export interface ToolDefinitionResolved {
	id: string;
	name: string;
	displayName: string;
	description: string;
	category: string;
	parametersSchema: Record<string, unknown>; // JSON Schema parseado
	responseSchema?: Record<string, unknown>; // JSON Schema parseado (opcional)
	executorType: 'builtin' | 'http' | 'script';
	executorConfig: Record<string, unknown>;
	requiresConfirmation: boolean;
	riskLevel: 'low' | 'medium' | 'high';
	usageDomain?: string;
	configOverride?: Record<string, unknown>; // Override por actividad
}

// Mensaje histórico para reconstruir el contexto conversacional
export interface AgentHistoryMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	toolCallId?: string;
	toolName?: string;
}

// ─── Resultado de ejecución de herramienta ───

export interface ToolResult {
	success: boolean;
	data?: unknown;
	displayText?: string;
	errorMessage?: string;
	durationMs: number;
	metadata?: Record<string, unknown>;
}

// ─── Mensajes Cliente → Servidor ───

export interface ToolConfirmationRequest {
	toolCallId: string;
	approved: boolean;
	rejectionReason?: string;
}

export interface UIComponentResponsePayload {
	instanceId: string;
	componentKey: string;
	payload: Record<string, unknown>;
}

// ─── Mensajes de display para el frontend ───

export interface AgentDisplayMessage {
	id: string;
	role: 'user' | 'assistant';
	parts: AgentDisplayPart[];
	createdAt: Date;
}

export interface AgentUserMessageMetrics {
	keystrokeCount: number;
	pasteCount: number;
	charCount: number;
	wordCount: number;
	timeSpentSeconds: number;
	editCount: number;
	deleteCount: number;
	startTimestamp: number;
	deviceInfo: {
		isMobile: boolean;
		userAgent: string;
		screenSize: string;
	};
}

export interface AgentSessionFinalization {
	executedAt: string;
	handler: 'mark_complete_and_notify' | 'mark_complete_only' | 'notify_only';
	toolCallId: string;
	toolName: string;
	assistantMessageId: string;
	payload: {
		summary: string;
		result?: 'completed' | 'passed' | 'failed';
		score?: number;
		feedback?: string;
	};
	finalizationConfig: Record<string, unknown> | null;
}

export interface AgentSessionGlobalStats {
	totalMessages: number;
	totalUserMessages: number;
	totalAssistantMessages: number;
	totalToolCalls: number;
	totalUiComponents: number;
	totalKeystrokeCount: number;
	totalPasteCount: number;
	sessionDurationSeconds: number;
	totalDraftTimeSpentSeconds: number;
	averageCharCount: number;
	averageWordCount: number;
	averageDraftTimeSpentSeconds: number;
	mobileUsage: number;
	desktopUsage: number;
	messagesWithMetrics: number;
}

export interface AgentSessionStats {
	totalMessages: number;
	userMessages: number;
	assistantMessages: number;
	totalToolCalls: number;
	failedToolCalls: number;
	pendingToolCalls: number;
	totalUiComponents: number;
	respondedUiComponents: number;
}

export interface AgentSessionSummary {
	status: 'completed' | 'pending' | 'attention';
	hasStudentMessages: boolean;
	previewText?: string;
	latestText?: string;
	lastActivityAt: Date;
	finalization: AgentSessionFinalization | null;
	stats: AgentSessionStats;
	globalStats: AgentSessionGlobalStats;
	messageMetricsById: Record<string, AgentUserMessageMetrics>;
}

export type AgentDisplayPart =
	| { kind: 'text'; content: string }
	| {
			kind: 'tool-call';
			toolCallId: string;
			toolName: string;
			toolDisplayName: string;
			args: Record<string, unknown>;
			status: string;
			result?: unknown;
			displayResult?: string;
			durationMs?: number;
	  }
	| {
			kind: 'ui-component';
			instanceId: string;
			componentKey: string;
			props: Record<string, unknown>;
			interactive: boolean;
			userResponse?: Record<string, unknown>;
	  };
