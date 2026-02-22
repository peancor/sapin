<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		options: Record<string, unknown>;
		height?: string;
		class?: string;
		theme?: 'light' | 'dark';
		onChartClick?: (params: unknown) => void;
	}

	let {
		options,
		height = '300px',
		class: className = '',
		theme = 'light',
		onChartClick
	}: Props = $props();

	let container = $state<HTMLDivElement | undefined>(undefined);
	let chart: import('echarts').ECharts | null = null;
	let mounted = $state(false);

	// Tema oscuro personalizado
	const darkTheme = {
		backgroundColor: 'transparent',
		textStyle: {
			color: '#9ca3af'
		},
		title: {
			textStyle: {
				color: '#f3f4f6'
			}
		},
		legend: {
			textStyle: {
				color: '#9ca3af'
			}
		},
		xAxis: {
			axisLine: {
				lineStyle: {
					color: '#4b5563'
				}
			},
			axisLabel: {
				color: '#9ca3af'
			},
			splitLine: {
				lineStyle: {
					color: '#374151'
				}
			}
		},
		yAxis: {
			axisLine: {
				lineStyle: {
					color: '#4b5563'
				}
			},
			axisLabel: {
				color: '#9ca3af'
			},
			splitLine: {
				lineStyle: {
					color: '#374151'
				}
			}
		}
	};

	async function initChart() {
		if (!browser || !container) return;

		// Importar echarts dinámicamente solo en el cliente
		const echarts = await import('echarts');

		// Destruir chart existente si hay uno
		if (chart) {
			chart.dispose();
		}

		// Registrar tema oscuro
		echarts.registerTheme('dark-custom', darkTheme);

		// Crear nuevo chart
		chart = echarts.init(container, theme === 'dark' ? 'dark-custom' : undefined);
		chart.setOption(options);
		if (onChartClick) {
			chart.on('click', onChartClick);
		}
	}

	function handleResize() {
		chart?.resize();
	}

	onMount(async () => {
		mounted = true;
		await initChart();
		window.addEventListener('resize', handleResize);
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('resize', handleResize);
		}
		chart?.dispose();
	});

	// Actualizar cuando cambien las opciones
	$effect(() => {
		if (mounted && chart && options) {
			chart.setOption(options, true);
		}
	});

	$effect(() => {
		if (mounted && chart) {
			chart.off('click');
			if (onChartClick) {
				chart.on('click', onChartClick);
			}
		}
	});

	// Reinicializar cuando cambie el tema
	$effect(() => {
		if (mounted && theme) {
			initChart();
		}
	});
</script>

{#if browser}
	<div bind:this={container} class="w-full {className}" style="height: {height}"></div>
{:else}
	<!-- Placeholder durante SSR -->
	<div
		class="w-full {className} flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700"
		style="height: {height}"
	>
		<span class="text-sm text-gray-400 dark:text-gray-500">Cargando gráfico...</span>
	</div>
{/if}
