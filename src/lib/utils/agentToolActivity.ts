import type { AgentDisplayPart, ToolConfirmationOutcome } from '$lib/types/agent';

export type ToolCall = Extract<AgentDisplayPart, { kind: 'tool-call' }>;
export type ActivityState =
	| 'executing'
	| 'completed'
	| 'failed'
	| 'rejected'
	| 'awaiting_confirmation'
	| 'awaiting_ui_response'
	| 'interrupted';

export function resultRecord(result: unknown): Record<string, unknown> {
	return result !== null && typeof result === 'object' && !Array.isArray(result)
		? (result as Record<string, unknown>)
		: {};
}

export function confirmedToolCall(call: ToolCall, outcome: ToolConfirmationOutcome): ToolCall {
	return {
		...call,
		status:
			outcome.status ??
			('result' in outcome
				? 'error' in resultRecord(outcome.result)
					? 'failed'
					: 'completed'
				: 'interrupted'),
		result: outcome.result,
		displayResult: outcome.displayText
	};
}

export function activityState(call: ToolCall, running: boolean): ActivityState {
	if (
		['completed', 'failed', 'rejected', 'awaiting_confirmation', 'awaiting_ui_response'].includes(
			call.status
		)
	)
		return call.status as ActivityState;
	return running && ['pending', 'executing', 'streaming'].includes(call.status)
		? 'executing'
		: 'interrupted';
}

export function toolActivity(parts: AgentDisplayPart[], running: boolean) {
	const interfaces = parts.filter((part) => part.kind === 'ui-component');
	const calls = new Map<string, ToolCall>();
	for (const part of parts) if (part.kind === 'tool-call') calls.set(part.toolCallId, part);
	const visible = [...calls.values()]
		.filter((call) => {
			// Failures always remain visible, even if a tool produced a partial interface.
			if (call.status === 'failed' || call.status === 'rejected') return true;
			const result = resultRecord(call.result);
			return !interfaces.some(
				(ui) =>
					ui.toolCallId === call.toolCallId ||
					(result.rendered === true && result.instanceId === ui.instanceId)
			);
		})
		.map((call) => ({ call, state: activityState(call, running) }));
	const groups: { id: string; items: typeof visible }[] = [];
	for (const item of visible) {
		const previous = groups.at(-1);
		if (
			item.state === 'completed' &&
			previous?.items[0].state === 'completed' &&
			previous.items[0].call.toolName === item.call.toolName
		)
			previous.items.push(item);
		else groups.push({ id: item.call.toolCallId, items: [item] });
	}
	return {
		calls: visible,
		groups,
		active: visible.filter((item) => item.state === 'executing'),
		failed: visible.filter((item) => item.state === 'failed').length
	};
}

/** Preserve identity and terminal states when a stream repeats a start event. */
export function addToolCall(parts: AgentDisplayPart[], call: ToolCall) {
	if (!parts.some((part) => part.kind === 'tool-call' && part.toolCallId === call.toolCallId))
		parts.push(call);
}

export function addToolInterface(
	parts: AgentDisplayPart[],
	ui: Extract<AgentDisplayPart, { kind: 'ui-component' }>
) {
	const index = parts.findIndex(
		(part) => part.kind === 'ui-component' && part.instanceId === ui.instanceId
	);
	if (index < 0) parts.push(ui);
	else parts[index] = { ...parts[index], ...ui };
	if (ui.toolCallId) {
		const call = parts.find(
			(part) => part.kind === 'tool-call' && part.toolCallId === ui.toolCallId
		);
		if (call?.kind === 'tool-call' && !['failed', 'rejected'].includes(call.status)) {
			call.status = ui.interactive ? 'awaiting_ui_response' : 'completed';
		}
	}
}
