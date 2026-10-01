<script lang="ts">
	interface SummaryItem {
		label: string;
		value: string;
	}

	interface Props {
		title: string;
		description: string;
		badge?: string;
		statusText?: string;
		actionLabel?: string;
		reopenLabel?: string;
		completed?: boolean;
		summaryItems?: SummaryItem[];
		accentClass?: string;
		onopen?: () => void;
	}

	let {
		title,
		description,
		badge,
		statusText,
		actionLabel = 'Abrir',
		reopenLabel = 'Reabrir',
		completed = false,
		summaryItems = [],
		accentClass = 'from-cyan-500 via-blue-500 to-indigo-500',
		onopen
	}: Props = $props();

	const ctaLabel = $derived(completed ? reopenLabel : actionLabel);
</script>

<button
	type="button"
	class="group my-2 w-full overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900"
	onclick={() => onopen?.()}
>
	<div class="bg-gradient-to-r px-4 py-4 text-white sm:px-5 sm:py-5 {accentClass}">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				{#if badge}
					<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">{badge}</p>
				{/if}
				<h3 class="mt-1 text-lg font-semibold sm:text-xl">{title}</h3>
				<p class="mt-2 max-w-2xl text-sm text-white/85 sm:text-[15px]">{description}</p>
			</div>

			<div class="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90">
				{completed ? 'Completado' : 'Pendiente'}
			</div>
		</div>
	</div>

	<div class="px-4 py-4 sm:px-5">
		{#if summaryItems.length > 0}
			<div class="grid gap-2 sm:grid-cols-3">
				{#each summaryItems as item}
					<div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
							{item.label}
						</p>
						<p class="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{item.value}</p>
					</div>
				{/each}
			</div>
		{/if}

		<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-slate-600 dark:text-slate-300">
				{statusText ?? (completed ? 'Disponible para consulta en modo solo lectura.' : 'Pulsa para abrir la experiencia completa.')}
			</p>

			<span
				class="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-transform group-hover:translate-x-0.5 dark:bg-white dark:text-slate-900"
			>
				{ctaLabel}
			</span>
		</div>
	</div>
</button>
