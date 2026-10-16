<script lang="ts">
	import type { AgentDisplayPart } from '$lib/types/agent';
	import {
		toolActivity,
		resultRecord,
		type ActivityState,
		type ToolCall
	} from '$lib/utils/agentToolActivity';
	import * as m from '$lib/paraglide/messages';

	let { parts, running = false }: { parts: AgentDisplayPart[]; running?: boolean } = $props();
	let activity = $derived(toolActivity(parts, running));
	let summary = $derived.by(() => {
		if (activity.calls.some((item) => item.state === 'awaiting_confirmation'))
			return m.agent_activity_confirmation();
		if (activity.active.length === 1)
			return m.agent_activity_executing({ name: activity.active[0].call.toolDisplayName });
		if (activity.active.length > 1)
			return m.agent_activity_parallel({ count: activity.active.length });
		if (activity.failed === 1)
			return activity.calls.length === 1
				? m.agent_activity_single_failure()
				: m.agent_activity_one_failure({ count: activity.calls.length });
		if (activity.failed)
			return m.agent_activity_failures({ count: activity.calls.length, failed: activity.failed });
		if (activity.calls.some((item) => item.state === 'interrupted'))
			return m.agent_activity_interrupted();
		if (activity.calls.some((item) => item.state === 'awaiting_ui_response'))
			return m.agent_activity_response();
		return activity.calls.length === 1
			? m.agent_activity_one()
			: m.agent_activity_summary({ count: activity.calls.length });
	});

	function stateLabel(state: ActivityState) {
		return {
			executing: m.agent_activity_running,
			completed: m.agent_activity_completed,
			failed: m.agent_activity_failed,
			rejected: m.agent_activity_rejected,
			awaiting_confirmation: m.agent_activity_confirmation,
			awaiting_ui_response: m.agent_activity_response,
			interrupted: m.agent_activity_interrupted
		}[state]();
	}

	function notice(call: ToolCall, state: ActivityState) {
		if (state === 'rejected') return m.agent_activity_rejected();
		const result = resultRecord(call.result);
		if (state === 'failed')
			return (
				call.displayResult ||
				(typeof result.error === 'string' ? result.error : m.agent_activity_error())
			);
		if (result.finalized === true) return m.agent_activity_finalized();
		return call.displayResult;
	}
</script>

{#snippet execution(call: ToolCall, state: ActivityState)}
	<div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
		<span class="min-w-0 break-words">{call.toolDisplayName}</span>
		<span>{stateLabel(state)}</span>
		{#if call.durationMs !== undefined}<span class="tabular-nums">{call.durationMs} ms</span>{/if}
	</div>
{/snippet}

{#if activity.calls.length}
	<div
		class="mt-2 min-w-0 text-xs text-gray-600 dark:text-gray-400"
		data-testid="agent-tool-activity"
	>
		<span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{summary}</span>
		{#each activity.calls as { call, state } (call.toolCallId)}
			{@const message = notice(call, state)}
			{#if message}
				<p
					class="my-2 break-words"
					class:text-red-700={state === 'failed'}
					class:dark:text-red-300={state === 'failed'}
				>
					{#if state === 'failed' || state === 'rejected'}<span class="font-medium"
							>{call.toolDisplayName + ': '}</span
						>{/if}{message}
				</p>
			{/if}
		{/each}
		<details>
			<summary
				class="min-h-8 cursor-pointer rounded py-2 break-words focus-visible:outline-2 focus-visible:outline-offset-2"
			>
				{#if activity.active.length}<span
						aria-hidden="true"
						class="mr-1 inline-block h-3 w-3 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
					></span>{/if}
				{summary}
			</summary>
			<div class="ml-2 border-l border-gray-200 pl-3 dark:border-gray-700">
				{#each activity.groups as group (group.id)}
					{#if group.items.length > 1}
						<details>
							<summary
								class="min-h-8 cursor-pointer rounded py-2 break-words focus-visible:outline-2 focus-visible:outline-offset-2"
								>{group.items[0].call.toolDisplayName} ×{group.items.length} · {stateLabel(
									group.items[0].state
								)}</summary
							>
							{#each group.items as { call, state } (call.toolCallId)}{@render execution(
									call,
									state
								)}{/each}
						</details>
					{:else}{@render execution(group.items[0].call, group.items[0].state)}{/if}
				{/each}
			</div>
		</details>
	</div>
{/if}
