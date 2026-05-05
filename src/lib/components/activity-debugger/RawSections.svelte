<script lang="ts">
	import type { ActivityDebuggerRawSection } from '$lib/types/activityDebugger';
	import JsonViewer from './JsonViewer.svelte';

	interface Props {
		sections: ActivityDebuggerRawSection[];
	}

	let { sections }: Props = $props();
</script>

<div class="space-y-4">
	{#each sections as section (section.id)}
		<details class="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/50">
			<summary class="cursor-pointer px-5 py-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-sm font-semibold text-slate-900 dark:text-white">{section.label}</p>
						{#if section.description}
							<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{section.description}</p>
						{/if}
					</div>
					<span class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
						JSON
					</span>
				</div>
			</summary>
			<div class="border-t border-slate-200 px-5 py-5 dark:border-slate-800">
				<JsonViewer value={section.data} />
			</div>
		</details>
	{/each}
</div>
