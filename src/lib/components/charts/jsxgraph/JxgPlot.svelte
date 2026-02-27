<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import '$lib/styles/jsxgraph.css';
	import type { GraphPlotProps } from './types';
	import { graphPlotPropsSchema } from './schema';
	import { compileFormulaExpression } from './formula';
	import { resolveViewportBounds } from './viewport';

	interface Props {
		plot: GraphPlotProps;
		height?: string;
		class?: string;
		theme?: 'light' | 'dark';
	}

	interface JxgBoardLike {
		create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown;
		update: () => void;
		resizeContainer?: (width: number, height: number, dontSetSize?: boolean) => void;
	}

	interface JxgLike {
		JSXGraph: {
			initBoard: (
				container: string | HTMLElement,
				attributes?: Record<string, unknown>
			) => JxgBoardLike;
			freeBoard: (board: JxgBoardLike) => void;
		};
	}

	let { plot, height = '320px', class: className = '', theme = 'light' }: Props = $props();

	let container = $state<HTMLDivElement | undefined>(undefined);
	let board: JxgBoardLike | null = null;
	let jxg: JxgLike | null = null;
	let mounted = false;
	let renderError = $state('');
	let renderRun = 0;

	function resolveJxgNamespace(module: unknown): JxgLike {
		const candidate = module as { default?: unknown };
		const resolved = candidate.default ?? module;
		return resolved as JxgLike;
	}

	function destroyBoard() {
		if (jxg && board) {
			jxg.JSXGraph.freeBoard(board);
		}
		board = null;
	}

	function getPrimaryColor(): string {
		return theme === 'dark' ? '#60a5fa' : '#2563eb';
	}

	async function renderBoard() {
		if (!browser || !container) return;

		const runId = ++renderRun;
		destroyBoard();
		renderError = '';

		const parsed = graphPlotPropsSchema.safeParse(plot);
		if (!parsed.success) {
			renderError = parsed.error.issues[0]?.message ?? 'Invalid graph configuration.';
			return;
		}

		const safePlot = parsed.data;

		let formulaFn: ((x: number) => number) | undefined;
		if (safePlot.mode === 'formula' && safePlot.formula) {
			try {
				formulaFn = compileFormulaExpression(safePlot.formula.expression);
			} catch (error) {
				renderError = error instanceof Error ? error.message : 'Could not compile the formula.';
				return;
			}
		}

		const jxgModule = resolveJxgNamespace(await import('jsxgraph'));
		if (runId !== renderRun) return;

		jxg = jxgModule;

		const viewport = resolveViewportBounds(safePlot, formulaFn);

		board = jxg.JSXGraph.initBoard(container, {
			boundingbox: [viewport.xMin, viewport.yMax, viewport.xMax, viewport.yMin],
			axis: true,
			grid: safePlot.axes?.grid ?? true,
			showNavigation: false,
			showCopyright: false,
			keepAspectRatio: false,
			pan: {
				enabled: true
			},
			zoom: {
				enabled: false
			}
		});

		const color =
			safePlot.mode === 'formula'
				? (safePlot.formula?.color ?? getPrimaryColor())
				: (safePlot.data?.color ?? getPrimaryColor());

		if (safePlot.mode === 'formula' && safePlot.formula && formulaFn) {
			const domainMin = safePlot.formula.domainMin ?? viewport.xMin;
			const domainMax = safePlot.formula.domainMax ?? viewport.xMax;

			board.create('functiongraph', [formulaFn, domainMin, domainMax], {
				strokeColor: color,
				strokeWidth: safePlot.formula.strokeWidth ?? 2
			});
		}

		if (safePlot.mode === 'data' && safePlot.data) {
			const style = safePlot.data.style ?? 'line';

			if (style === 'line') {
				const sorted = [...safePlot.data.points].sort((a, b) => a.x - b.x);
				const xValues = sorted.map((point) => point.x);
				const yValues = sorted.map((point) => point.y);

				board.create('curve', [xValues, yValues], {
					strokeColor: color,
					strokeWidth: 2,
					fillColor: 'none'
				});
			}

			if (style === 'scatter') {
				for (const point of safePlot.data.points) {
					board.create('point', [point.x, point.y], {
						name: '',
						size: 3,
						fixed: true,
						strokeColor: color,
						fillColor: color,
						highlight: false
					});
				}
			}
		}

		const xLabel = safePlot.axes?.xLabel;
		const yLabel = safePlot.axes?.yLabel;

		if (xLabel) {
			board.create(
				'text',
				[
					viewport.xMax - (viewport.xMax - viewport.xMin) * 0.02,
					viewport.yMin + (viewport.yMax - viewport.yMin) * 0.04,
					xLabel
				],
				{
					anchorX: 'right',
					anchorY: 'bottom',
					fontSize: 12,
					fixed: true
				}
			);
		}

		if (yLabel) {
			board.create(
				'text',
				[
					viewport.xMin + (viewport.xMax - viewport.xMin) * 0.02,
					viewport.yMax - (viewport.yMax - viewport.yMin) * 0.02,
					yLabel
				],
				{
					anchorX: 'left',
					anchorY: 'top',
					fontSize: 12,
					fixed: true
				}
			);
		}

		board.update();
	}

	function handleResize() {
		if (!container || !board || !board.resizeContainer) return;

		const width = container.clientWidth;
		const currentHeight = container.clientHeight;
		if (width <= 0 || currentHeight <= 0) return;

		board.resizeContainer(width, currentHeight, true);
		board.update();
	}

	onMount(async () => {
		mounted = true;
		await renderBoard();
		window.addEventListener('resize', handleResize);
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('resize', handleResize);
		}
		destroyBoard();
	});

	$effect(() => {
		if (!mounted) return;
		void renderBoard();
	});
</script>

{#if browser}
	<div class="relative w-full {className}" style="height: {height}">
		<div
			bind:this={container}
			class="jxgbox h-full w-full rounded-lg border border-gray-200 dark:border-gray-700"
		></div>

		{#if renderError}
			<div
				class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/90 px-4 text-center text-sm text-red-600 dark:bg-gray-900/90 dark:text-red-400"
			>
				{renderError}
			</div>
		{/if}
	</div>
{:else}
	<div
		class="w-full {className} flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
		style="height: {height}"
	>
		Cargando grafico...
	</div>
{/if}
