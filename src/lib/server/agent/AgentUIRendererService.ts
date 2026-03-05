import { nanoid } from 'nanoid';
import type { AgentContext, ToolDefinitionResolved } from '$lib/types/agent';
import { DBAgentUIUtils } from '$lib/server/db/agent';
import { getUIRendererHandler } from './ui-tools/registry';

export interface UISentinel {
	__uiComponent: true;
	instanceId: string;
	componentKey: string;
	props: Record<string, unknown>;
	interactive: boolean;
}

type UIRenderExecutionResult = { ok: true; sentinel: UISentinel } | { ok: false; error: string };

interface RenderUIComponentParams {
	context: AgentContext;
	runtimeTool: ToolDefinitionResolved;
	input: Record<string, unknown>;
	assistantMsgId: string;
	toolName: string;
	toolCallId: string;
}

export class AgentUIRendererService {
	static async renderUIComponent(params: RenderUIComponentParams): Promise<UIRenderExecutionResult> {
		const componentKey = params.runtimeTool.executorConfig.componentKey as string | undefined;
		const toolInteractive = (params.runtimeTool.executorConfig.interactive as boolean) ?? false;

		if (!componentKey) {
			return {
				ok: false,
				error: `Tool "${params.toolName}" is missing executorConfig.componentKey.`
			};
		}

		if (!params.context.enabledUIComponentKeys.includes(componentKey)) {
			return {
				ok: false,
				error: `UI component "${componentKey}" is not enabled for this activity.`
			};
		}

		const handler = getUIRendererHandler(componentKey);

		let handled;
		try {
			handled = await handler.validateAndBuildProps(params.input, {
				agentContext: params.context,
				runtimeTool: params.runtimeTool,
				toolName: params.toolName,
				toolCallId: params.toolCallId,
				assistantMsgId: params.assistantMsgId
			});
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : 'Invalid UI renderer input.'
			};
		}

		const uiComp = await DBAgentUIUtils.getUIComponentByKey(componentKey);
		if (!uiComp) {
			return {
				ok: false,
				error: `UI component "${componentKey}" was not found in the registry.`
			};
		}

		const instanceId = nanoid();
		const interactive = handled.interactive ?? toolInteractive;

		await DBAgentUIUtils.saveUIInstance({
			id: instanceId,
			messageId: params.assistantMsgId,
			uiComponentId: uiComp.id,
			componentKey,
			props: JSON.stringify(handled.props),
			metadata: JSON.stringify({ componentKey, toolCallId: params.toolCallId })
		});

		return {
			ok: true,
			sentinel: {
				__uiComponent: true,
				instanceId,
				componentKey,
				props: handled.props,
				interactive
			}
		};
	}
}
