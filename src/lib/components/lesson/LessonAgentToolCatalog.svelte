<script lang="ts">
	import {
		getLessonAgentToolGroups,
		type LessonAgentToolPresentationItem
	} from '$lib/lesson/lessonAgentToolPresentation';

	interface Props {
		tools: LessonAgentToolPresentationItem[];
		selectedToolIds: string[];
		onToggle: (toolId: string, checked: boolean) => void;
		emptyMessage?: string;
	}

	let {
		tools,
		selectedToolIds,
		onToggle,
		emptyMessage = 'No hay tools disponibles con la politica actual.'
	}: Props = $props();

	const groupedTools = $derived(getLessonAgentToolGroups(tools));
	const selectedIds = $derived(new Set(selectedToolIds));
</script>

{#if groupedTools.length === 0}
	<div
		class="rounded-2xl border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
	>
		{emptyMessage}
	</div>
{:else}
	<div class="space-y-5">
		{#each groupedTools as group (group.id)}
			<section class="space-y-3">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h4 class="text-sm font-semibold text-gray-900 dark:text-white">{group.title}</h4>
						<p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
							{group.description}
						</p>
					</div>
					<span
						class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
					>
						{group.tools.length} tool{group.tools.length === 1 ? '' : 's'}
					</span>
				</div>

				<div class="grid gap-3 md:grid-cols-2">
					{#each group.tools as tool (tool.id)}
						<label class="rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800">
							<div class="flex items-start gap-3">
								<input
									type="checkbox"
									class="text-primary-600 mt-1 h-4 w-4 rounded border-gray-300"
									checked={selectedIds.has(tool.id)}
									onchange={(event) =>
										onToggle(tool.id, (event.currentTarget as HTMLInputElement).checked)}
								/>
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<p class="text-sm font-medium text-gray-900 dark:text-white">
											{tool.displayName}
										</p>
										{#if tool.isInteractiveUi}
											<span
												class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/30 dark:text-sky-200"
											>
												UI
											</span>
										{/if}
										{#if tool.requiresConfirmation}
											<span
												class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
											>
												HITL
											</span>
										{/if}
										{#if tool.isPersistent}
											<span
												class="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-200"
											>
												Persistente
											</span>
										{/if}
									</div>
									<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
										{tool.description}
									</p>
								</div>
							</div>
						</label>
					{/each}
				</div>
			</section>
		{/each}
	</div>
{/if}
