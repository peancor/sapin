import type { AgentContext, ToolResult } from '$lib/types/agent';

export type BuiltinToolCategory =
	| 'knowledge'
	| 'evaluation'
	| 'communication'
	| 'data'
	| 'custom'
	| 'ui';

export type BuiltinToolExecutorType = 'builtin' | 'http' | 'script';

export type BuiltinToolRiskLevel = 'low' | 'medium' | 'high';

export interface ToolManifest {
	name: string;
	displayName: string;
	description: string;
	category: BuiltinToolCategory;
	parametersSchema: Record<string, unknown>;
	responseSchema?: Record<string, unknown>;
	executorType: BuiltinToolExecutorType;
	executorConfig: Record<string, unknown>;
	requiresConfirmation: boolean;
	riskLevel: BuiltinToolRiskLevel;
	usageDomain: string;
	isSystem?: boolean;
	version?: string;
}

export type BuiltinToolHandler = (
	args: any,
	context: AgentContext
) => Promise<ToolResult>;

export interface BuiltinToolPackage {
	manifest: ToolManifest;
	handler?: BuiltinToolHandler;
}
