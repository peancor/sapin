<script lang="ts">
	import JxgPlot from '$lib/components/charts/jsxgraph/JxgPlot.svelte';
	import { graphPlotPropsSchema } from '$lib/components/charts/jsxgraph/schema';
	import type {
		GraphAxesConfig,
		GraphDataConfig,
		GraphFormulaConfig,
		GraphPlotProps,
		GraphViewportConfig
	} from '$lib/components/charts/jsxgraph/types';

	interface Props {
		instanceId: string;
		mode: GraphPlotProps['mode'];
		title?: string;
		formula?: GraphFormulaConfig;
		data?: GraphDataConfig;
		axes?: GraphAxesConfig;
		viewport?: GraphViewportConfig;
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score?: number) => void;
	}

	let { mode, title, formula, data, axes, viewport }: Props = $props();

	const plot = $derived({
		mode,
		title,
		formula,
		data,
		axes,
		viewport
	});

	const parsedPlot = $derived(graphPlotPropsSchema.safeParse(plot));

	const cardTitle = $derived(
		title ?? (mode === 'formula' ? 'Grafico de formula' : 'Grafico de datos')
	);
</script>

<div
	class="my-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
>
	<div
		class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700"
	>
		<div class="flex items-center gap-2">
			<svg class="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M11 17a1 1 0 102 0 1 1 0 00-2 0zm0-10a1 1 0 102 0 1 1 0 00-2 0zm-6 5a1 1 0 102 0 1 1 0 00-2 0zm12 0a1 1 0 102 0 1 1 0 00-2 0M7.5 12h9m-8-5.5l7 11"
				/>
			</svg>
			<span class="text-sm font-semibold text-gray-900 dark:text-white">{cardTitle}</span>
		</div>
		<span
			class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300"
		>
			{mode}
		</span>
	</div>

	<div class="p-4">
		{#if parsedPlot.success}
			<JxgPlot plot={parsedPlot.data} height="320px" />
		{:else}
			<div
				class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
			>
				Configuracion de grafico invalida: {parsedPlot.error.issues[0]?.message ?? 'Unknown error'}
			</div>
		{/if}
	</div>
</div>
