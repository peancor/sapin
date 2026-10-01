import type { AgentDisplayMessage, AgentStreamPart, ToolDefinitionResolved } from '$lib/types/agent';

export type StaffAgentFeatureKey = 'staff_agent';
export type StaffAgentWorkspaceKind = 'course_staff' | 'activity_staff';
export type StaffAgentScopeType = 'course' | 'interactive_learning';
export type StaffAgentWorkspaceVisibility = 'shared' | 'private';
export type StaffAgentThreadStatus = 'draft' | 'active' | 'paused' | 'completed';

export interface StaffAgentWorkspaceConfig {
	id: string;
	featureKey: StaffAgentFeatureKey;
	kind: StaffAgentWorkspaceKind;
	scopeType: StaffAgentScopeType;
	scopeId: string;
	visibility: StaffAgentWorkspaceVisibility;
	ownerUserId: string | null;
	llmRole: string | null;
	llmInstructions: string | null;
	llmContext: string | null;
	systemPrompt: string | null;
	llmModel: string | null;
	maxToolRoundtrips: number;
	parallelToolCalls: boolean;
	toolChoice: 'auto' | 'required' | 'none';
	enabledToolIds: string[];
	updatedAt: string;
}

export interface StaffAgentThreadSummary {
	id: string;
	workspaceId: string;
	chatId: string;
	createdByUserId: string;
	title: string | null;
	status: StaffAgentThreadStatus;
	summary: string | null;
	lastMessageAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface StaffAgentSelectedThread extends StaffAgentThreadSummary {
	messages: AgentDisplayMessage[];
}

export interface StaffAgentRuntimeContext {
	config: StaffAgentWorkspaceConfig;
	enabledTools: ToolDefinitionResolved[];
}

export type StaffAgentStreamPart = AgentStreamPart;
