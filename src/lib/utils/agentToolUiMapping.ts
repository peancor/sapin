type ToolLike = {
	name?: string | null;
	displayName?: string | null;
	executorType?: string | null;
	executorConfig?: unknown;
};

export type UIRendererBindingIssue = 'invalid_executor_config' | 'missing_component_key';

export interface UIRendererBinding {
	toolName: string;
	toolDisplayName: string;
	componentKey: string | null;
	issue: UIRendererBindingIssue | null;
}

function parseExecutorConfig(executorConfig: unknown): Record<string, unknown> | null {
	if (executorConfig && typeof executorConfig === 'object' && !Array.isArray(executorConfig)) {
		return executorConfig as Record<string, unknown>;
	}

	if (typeof executorConfig === 'string') {
		try {
			const parsed = JSON.parse(executorConfig) as unknown;
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return null;
		}
	}

	return null;
}

export function resolveUIRendererBindings(tools: ToolLike[]): UIRendererBinding[] {
	const bindings: UIRendererBinding[] = [];

	for (const tool of tools) {
		if (tool.executorType !== 'builtin') continue;

		const toolName = tool.name ?? 'unknown_tool';
		const toolDisplayName = tool.displayName ?? toolName;
		const executorConfig = parseExecutorConfig(tool.executorConfig);

		if (!executorConfig) {
			bindings.push({
				toolName,
				toolDisplayName,
				componentKey: null,
				issue: 'invalid_executor_config'
			});
			continue;
		}

		if (executorConfig.handler !== 'ui_renderer') continue;

		const rawComponentKey = executorConfig.componentKey;
		const componentKey =
			typeof rawComponentKey === 'string' && rawComponentKey.trim().length > 0
				? rawComponentKey.trim()
				: null;

		bindings.push({
			toolName,
			toolDisplayName,
			componentKey,
			issue: componentKey ? null : 'missing_component_key'
		});
	}

	return bindings;
}

export function deriveEnabledUIComponentKeysFromTools(tools: ToolLike[]): string[] {
	const keys = new Set<string>();

	for (const binding of resolveUIRendererBindings(tools)) {
		if (binding.componentKey) keys.add(binding.componentKey);
	}

	return [...keys];
}
