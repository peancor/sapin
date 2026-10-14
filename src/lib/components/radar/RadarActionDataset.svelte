<script lang="ts">
	import { untrack } from 'svelte';
	import EChart from '$lib/components/charts/EChart.svelte';
	import { theme } from '$lib/stores/theme';
	import type { RadarActionDataset } from '$lib/types/radarActions';
	let {
		dataset,
		kind,
		onEvidence
	}: {
		dataset: RadarActionDataset;
		kind: 'statistics' | 'table' | 'bar' | 'line';
		onEvidence: (ids: string[]) => void;
	} = $props();
	let view = $state(untrack(() => kind));
	let filter = $state('');
	let series = $state<'both' | 'current' | 'previous' | 'difference'>('both');
	const hasComparison = $derived(dataset.rows.some((row) => row.previous !== null));
	const rows = $derived(
		dataset.rows.filter((row) => row.label.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
	);
	const values = $derived(
		rows.map((row) =>
			series === 'difference'
				? row.value !== null && row.previous !== null
					? row.value - row.previous
					: null
				: row.value
		)
	);
	const chartOptions = $derived({
		animation: false,
		aria: { enabled: true },
		tooltip: { trigger: 'axis', renderMode: 'richText' },
		legend: { top: 0 },
		grid: { left: 55, right: 20, top: 45, bottom: 85, containLabel: true },
		xAxis: {
			type: 'category',
			data: rows.map((row) => row.label),
			axisLabel: { rotate: rows.length > 5 ? 35 : 0, width: 120, overflow: 'truncate' }
		},
		yAxis: { type: 'value', name: dataset.unit },
		dataZoom:
			rows.length > 12
				? [{ type: 'slider', start: 0, end: Math.min(100, 1200 / rows.length) }]
				: [],
		series: [
			...(series !== 'previous'
				? [
						{
							name: series === 'difference' ? 'Diferencia' : 'Periodo actual',
							type: view === 'line' ? 'line' : 'bar',
							data: values,
							connectNulls: false
						}
					]
				: []),
			...(hasComparison && (series === 'both' || series === 'previous')
				? [
						{
							name: 'Periodo anterior',
							type: view === 'line' ? 'line' : 'bar',
							data: rows.map((row) => row.previous),
							connectNulls: false
						}
					]
				: [])
		]
	});
	const inputClass =
		'mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-800';
	function number(value: number | null) {
		return value === null
			? 'Sin datos'
			: new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(value);
	}
</script>

<section
	class="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700"
	aria-label={dataset.title}
>
	<h4 class="font-semibold">{dataset.title}</h4>
	<p class="text-xs text-gray-500 dark:text-gray-400">
		{dataset.definition} · Unidad: {dataset.unit}
	</p>
	<div class="flex flex-wrap items-end gap-3">
		<label class="text-xs font-medium"
			>Mostrar como<select class={inputClass} bind:value={view}
				><option value="statistics">Estadísticas</option><option value="table">Tabla</option><option
					value="bar">Barras</option
				><option value="line">Líneas</option></select
			></label
		>
		<label class="text-xs font-medium"
			>Filtrar filas<input
				class={inputClass}
				bind:value={filter}
				type="search"
				placeholder="Buscar etiqueta"
			/></label
		>
		{#if hasComparison}<label class="text-xs font-medium"
				>Series<select class={inputClass} bind:value={series}
					><option value="both">Ambos periodos</option><option value="current"
						>Periodo actual</option
					><option value="previous">Periodo anterior</option><option value="difference"
						>Diferencia</option
					></select
				></label
			>{/if}
	</div>
	<p class="text-xs text-gray-500 dark:text-gray-400">
		{rows.length} de {dataset.rows.length} filas. Estos filtros solo cambian la presentación.
	</p>
	{#if !rows.length}<p class="text-sm">No hay filas que coincidan con el filtro.</p>
	{:else if view === 'statistics'}
		<dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each rows as row (row.key)}<div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
					<dt class="text-sm">{row.label}</dt>
					<dd class="mt-1 text-2xl font-semibold">
						{number(
							series === 'previous'
								? row.previous
								: series === 'difference'
									? row.value !== null && row.previous !== null
										? row.value - row.previous
										: null
									: row.value
						)}
					</dd>
					{#if hasComparison && series === 'both'}<dd class="mt-1 text-xs">
							Anterior: {number(row.previous)}
						</dd>{/if}{#if row.evidenceIds.length}<dd>
							<button
								type="button"
								class="mt-2 text-xs font-semibold underline"
								onclick={() => onEvidence(row.evidenceIds)}>Ver evidencias de {row.label}</button
							>
						</dd>{/if}
				</div>{/each}
		</dl>
	{:else if view === 'bar' || view === 'line'}<EChart
			options={chartOptions}
			theme={$theme === 'dark' ? 'dark' : 'light'}
			height="360px"
		/>{/if}
	{#if rows.length && view !== 'statistics'}
		<details open={view === 'table'}>
			<summary class="cursor-pointer text-sm font-medium">Datos y evidencias en tabla</summary>
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-left text-sm">
					<caption class="sr-only">{dataset.title}, {dataset.unit}</caption><thead
						><tr class="border-b border-gray-200 dark:border-gray-700"
							><th scope="col" class="p-2">Etiqueta</th>{#if series !== 'previous'}<th
									scope="col"
									class="p-2">{series === 'difference' ? 'Diferencia' : 'Actual'}</th
								>{/if}{#if hasComparison && (series === 'both' || series === 'previous')}<th
									scope="col"
									class="p-2">Anterior</th
								>{/if}<th scope="col" class="p-2">Evidencias</th></tr
						></thead
					><tbody
						>{#each rows as row (row.key)}<tr class="border-b border-gray-100 dark:border-gray-700"
								><th scope="row" class="p-2 font-medium">{row.label}</th
								>{#if series !== 'previous'}<td class="p-2 tabular-nums"
										>{number(
											series === 'difference'
												? row.value !== null && row.previous !== null
													? row.value - row.previous
													: null
												: row.value
										)}</td
									>{/if}{#if hasComparison && (series === 'both' || series === 'previous')}<td
										class="p-2 tabular-nums">{number(row.previous)}</td
									>{/if}<td class="p-2"
									>{#if row.evidenceIds.length}<button
											type="button"
											class="font-semibold underline"
											onclick={() => onEvidence(row.evidenceIds)}
											aria-label={`Ver evidencias de ${row.label}`}>Consultar</button
										>{:else}—{/if}</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>
		</details>
	{/if}
</section>
