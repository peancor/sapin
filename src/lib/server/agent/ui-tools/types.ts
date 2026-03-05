import type { AgentContext, ToolDefinitionResolved } from '$lib/types/agent';

export interface UIRendererHandlerContext {
	agentContext: AgentContext;
	runtimeTool: ToolDefinitionResolved;
	toolName: string;
	toolCallId: string;
	assistantMsgId: string;
}

export interface UIRendererHandlerResult {
	props: Record<string, unknown>;
	interactive?: boolean;
}

export interface UIRendererHandler {
	componentKey: string;
	validateAndBuildProps(
		input: Record<string, unknown>,
		context: UIRendererHandlerContext
	): Promise<UIRendererHandlerResult>;
}
