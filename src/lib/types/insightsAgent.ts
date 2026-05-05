import type { AgentDisplayMessage, AgentStreamPart, ToolDefinitionResolved } from '$lib/types/agent';

export type InsightsAgentScopeMode = 'cohort' | 'students' | 'sessions';

export interface InsightsAgentRunScope {
	mode: InsightsAgentScopeMode;
	studentIds: string[];
	chatIds: string[];
	dateFrom: string | null;
	dateTo: string | null;
	search: string | null;
}

export interface InsightsAgentConfig {
	id: string;
	llmRole: string | null;
	llmInstructions: string | null;
	llmContext: string | null;
	systemPrompt: string | null;
	llmModel: string | null;
	temperature: number | null;
	maxTokens: number | null;
	topP: number | null;
	maxToolRoundtrips: number;
	parallelToolCalls: boolean;
	toolChoice: 'auto' | 'required' | 'none';
	enabledToolIds: string[];
	updatedAt: string;
}

export interface InsightsAgentRunSummary {
	id: string;
	interactiveLearningId: string;
	chatId: string;
	createdByUserId: string;
	title: string | null;
	status: 'draft' | 'running' | 'completed' | 'paused' | 'failed';
	summary: string | null;
	scope: InsightsAgentRunScope;
	lastMessageAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface InsightsAgentSelectedRun extends InsightsAgentRunSummary {
	messages: AgentDisplayMessage[];
}

export interface InsightsAgentRuntimeContext {
	config: InsightsAgentConfig;
	enabledTools: ToolDefinitionResolved[];
	scope: InsightsAgentRunScope;
}

export type InsightsAgentStreamPart = AgentStreamPart;
