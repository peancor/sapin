<script lang="ts">
	import { goto } from '$app/navigation';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import {
		Button,
		Alert,
		Badge,
		Avatar,
		Input,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell
	} from 'flowbite-svelte';
	import {
		Users,
		Eye,
		Clock,
		TrendingUp,
		TrendingDown,
		Activity,
		AlertTriangle,
		Settings,
		Radio,
		Search,
		Monitor,
		Smartphone,
		Tablet,
		Globe,
		MousePointer,
		User,
		UserX,
		LayoutDashboard,
		List,
		ChevronRight
	} from 'lucide-svelte';
	import EChart from '$lib/components/charts/EChart.svelte';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data } = $props();

	// Detectar tema
	let isDark = $state(false);
	let searchQuery = $state(data.search || '');
	let activeTab = $state(data.tab || 'overview');

	$effect(() => {
		if (typeof window !== 'undefined') {
			isDark = document.documentElement.classList.contains('dark');
			const observer = new MutationObserver(() => {
				isDark = document.documentElement.classList.contains('dark');
			});
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
			return () => observer.disconnect();
		}
	});

	// Breadcrumb
	$effect(() => {
		breadcrumb.set([
			{ label: 'Admin', href: '/admin' },
			{ label: 'Analytics', href: '/admin/analytics' }
		]);
	});

	// Stats cards
	const statCards = $derived([
		{
			title: 'Visitantes Hoy',
			value: data.stats.today.uniqueVisitors,
			change: data.stats.comparison.visitorsChange,
			icon: Users,
			color: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
		},
		{
			title: 'Páginas Vistas',
			value: data.stats.today.pageViews,
			change: data.stats.comparison.pageViewsChange,
			icon: Eye,
			color: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
		},
		{
			title: 'Sesiones',
			value: data.stats.today.sessions,
			change: data.stats.comparison.sessionsChange,
			icon: Activity,
			color: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400'
		},
		{
			title: 'Duración Media',
			value: formatDuration(data.stats.today.avgSessionDuration),
			icon: Clock,
			color: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400',
			isText: true
		}
	]);

	// Opciones de gráfico de líneas (visitantes)
	const lineChartOptions = $derived({
		tooltip: {
			trigger: 'axis',
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		legend: {
			data: ['Visitantes', 'Páginas Vistas'],
			textStyle: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
		xAxis: {
			type: 'category',
			boundaryGap: false,
			data: data.stats.charts.visitorsOverTime.map((d: { date: string }) => formatDate(d.date)),
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		yAxis: {
			type: 'value',
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' },
			splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
		},
		series: [
			{
				name: 'Visitantes',
				type: 'line',
				smooth: true,
				areaStyle: { opacity: 0.3 },
				data: data.stats.charts.visitorsOverTime.map((d: { visitors: number }) => d.visitors),
				itemStyle: { color: '#3b82f6' }
			},
			{
				name: 'Páginas Vistas',
				type: 'line',
				smooth: true,
				areaStyle: { opacity: 0.3 },
				data: data.stats.charts.visitorsOverTime.map((d: { pageViews: number }) => d.pageViews),
				itemStyle: { color: '#10b981' }
			}
		]
	});

	// Opciones de gráfico de barras (páginas)
	const barChartOptions = $derived({
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
		xAxis: {
			type: 'value',
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' },
			splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
		},
		yAxis: {
			type: 'category',
			data: data.stats.charts.topPages
				.slice(0, 5)
				.map((p: { path: string }) => truncatePath(p.path))
				.reverse(),
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		series: [
			{
				type: 'bar',
				data: data.stats.charts.topPages
					.slice(0, 5)
					.map((p: { views: number }) => p.views)
					.reverse(),
				itemStyle: {
					color: '#8b5cf6',
					borderRadius: [0, 4, 4, 0]
				}
			}
		]
	});

	// Opciones de gráfico de dispositivos (pie)
	const pieChartOptions = $derived({
		tooltip: {
			trigger: 'item',
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		legend: {
			orient: 'vertical',
			right: '5%',
			top: 'center',
			textStyle: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		series: [
			{
				type: 'pie',
				radius: ['40%', '70%'],
				center: ['35%', '50%'],
				avoidLabelOverlap: false,
				itemStyle: { borderRadius: 8, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
				label: { show: false },
				emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
				labelLine: { show: false },
				data: data.stats.charts.deviceBreakdown.map(
					(d: { device: string; count: number }, i: number) => ({
						value: d.count,
						name: getDeviceName(d.device),
						itemStyle: { color: ['#3b82f6', '#10b981', '#f59e0b'][i] || '#6b7280' }
					})
				)
			}
		]
	});

	// Opciones de actividad por hora
	const hourlyChartOptions = $derived({
		tooltip: {
			trigger: 'axis',
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
		xAxis: {
			type: 'category',
			data: Array.from({ length: 24 }, (_, i) => `${i}h`),
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280', interval: 2 }
		},
		yAxis: {
			type: 'value',
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' },
			splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
		},
		series: [
			{
				type: 'bar',
				data: data.stats.charts.hourlyActivity,
				itemStyle: {
					color: '#f59e0b',
					borderRadius: [4, 4, 0, 0]
				}
			}
		]
	});

	// Helpers
	function formatDuration(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
	}

	function formatDateTime(date: Date | string): string {
		const d = new Date(date);
		return d.toLocaleString('es-ES', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatRelativeTime(date: Date | string): string {
		const d = new Date(date);
		const now = new Date();
		const diff = now.getTime() - d.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Ahora';
		if (minutes < 60) return `Hace ${minutes}m`;
		if (hours < 24) return `Hace ${hours}h`;
		return `Hace ${days}d`;
	}

	function truncatePath(path: string): string {
		if (path.length > 25) return path.slice(0, 22) + '...';
		return path;
	}

	function getDeviceName(device: string): string {
		switch (device) {
			case 'desktop':
				return 'Escritorio';
			case 'mobile':
				return 'Móvil';
			case 'tablet':
				return 'Tablet';
			default:
				return device;
		}
	}

	function getDeviceIcon(device: string | null) {
		switch (device) {
			case 'desktop':
				return Monitor;
			case 'mobile':
				return Smartphone;
			case 'tablet':
				return Tablet;
			default:
				return Globe;
		}
	}

	function getEventTypeColor(type: string): 'blue' | 'gray' | 'green' | 'red' | 'purple' {
		switch (type) {
			case 'page_view':
				return 'blue';
			case 'page_exit':
				return 'gray';
			case 'session_start':
				return 'green';
			case 'session_end':
				return 'red';
			default:
				return 'purple';
		}
	}

	function getEventTypeName(type: string): string {
		switch (type) {
			case 'page_view':
				return 'Vista';
			case 'page_exit':
				return 'Salida';
			case 'session_start':
				return 'Inicio';
			case 'session_end':
				return 'Fin';
			default:
				return type;
		}
	}

	function handlePeriodChange(newPeriod: string) {
		const params = new SvelteURLSearchParams();
		params.set('period', newPeriod);
		if (searchQuery) params.set('search', searchQuery);
		params.set('tab', activeTab);
		goto(`?${params.toString()}`);
	}

	function handleSearch() {
		const params = new SvelteURLSearchParams();
		params.set('period', data.period);
		if (searchQuery) params.set('search', searchQuery);
		params.set('tab', activeTab);
		goto(`?${params.toString()}`);
	}

	function handleTabChange(tab: string) {
		activeTab = tab;
		const params = new SvelteURLSearchParams();
		params.set('period', data.period);
		if (searchQuery) params.set('search', searchQuery);
		params.set('tab', tab);
		goto(`?${params.toString()}`);
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Métricas de uso y comportamiento de usuarios
			</p>
		</div>
		<div class="flex gap-2">
			<a href={resolve("/admin/analytics/realtime")}>
				<Button color="alternative" class="flex items-center gap-2">
					<Radio class="h-4 w-4" />
					Tiempo Real
				</Button>
			</a>
			<a href={resolve("/admin/settings")}>
				<Button color="light" class="flex items-center gap-2">
					<Settings class="h-4 w-4" />
					Configuración
				</Button>
			</a>
		</div>
	</div>

	<!-- Alert si está desactivado -->
	{#if !data.config.enabled}
		<Alert color="yellow" class="flex items-center gap-3">
			{#snippet icon()}
				<AlertTriangle class="h-5 w-5" />
			{/snippet}
			<div>
				<span class="font-medium">El sistema de analítica está desactivado.</span>
				Los datos mostrados son históricos.
				<a href={resolve("/admin/settings")} class="ml-2 font-medium underline hover:no-underline">
					Ir a Configuración para activarlo
				</a>
			</div>
		</Alert>
	{/if}

	<!-- Tabs de navegación -->
	<div class="border-b border-gray-200 dark:border-gray-700">
		<nav class="flex gap-4">
			{#each [{ id: 'overview', label: 'Resumen', icon: LayoutDashboard }, { id: 'users', label: 'Usuarios', icon: Users }, { id: 'activity', label: 'Actividad', icon: List }] as tab (tab.id)}
				<button
					type="button"
					class="flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors {activeTab ===
					tab.id
						? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					onclick={() => handleTabChange(tab.id)}
				>
					<tab.icon class="h-4 w-4" />
					{tab.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Period selector + Search -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex gap-2">
			{#each [{ value: 'day', label: 'Hoy' }, { value: 'week', label: 'Última semana' }, { value: 'month', label: 'Último mes' }] as option (option.value)}
				<button
					type="button"
					class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {data.period ===
					option.value
						? 'bg-primary-600 text-white'
						: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
					onclick={() => handlePeriodChange(option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>

		{#if activeTab === 'users'}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSearch();
				}}
				class="flex gap-2"
			>
				<Input type="search" placeholder="Buscar usuarios..." bind:value={searchQuery} class="w-64">
					{#snippet left()}
						<Search class="h-4 w-4 text-gray-400" />
					{/snippet}
				</Input>
				<Button type="submit" color="primary" size="sm">Buscar</Button>
			</form>
		{/if}
	</div>

	<!-- TAB: Overview -->
	{#if activeTab === 'overview'}
		<!-- Stats Cards -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#each statCards as card (card.title)}
				<div
					class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-500 dark:text-gray-400">{card.title}</p>
							<p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
								{card.isText ? card.value : card.value.toLocaleString()}
							</p>
						</div>
						<div class="flex h-12 w-12 items-center justify-center rounded-lg {card.color}">
							<card.icon class="h-6 w-6" />
						</div>
					</div>
					{#if card.change !== undefined}
						<div class="mt-3 flex items-center text-sm">
							{#if card.change >= 0}
								<TrendingUp class="mr-1 h-4 w-4 text-green-500" />
								<span class="font-medium text-green-500">+{card.change}%</span>
							{:else}
								<TrendingDown class="mr-1 h-4 w-4 text-red-500" />
								<span class="font-medium text-red-500">{card.change}%</span>
							{/if}
							<span class="ml-2 text-gray-500 dark:text-gray-400">vs período anterior</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Charts Row 1: Line chart -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
		>
			<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
				Visitantes y Páginas Vistas
			</h3>
			{#if data.stats.charts.visitorsOverTime.length > 0}
				<EChart options={lineChartOptions} height="300px" theme={isDark ? 'dark' : 'light'} />
			{:else}
				<div class="flex h-[300px] items-center justify-center text-gray-500 dark:text-gray-400">
					No hay datos para el período seleccionado
				</div>
			{/if}
		</div>

		<!-- Charts Row 2: Bar + Pie -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Top Pages -->
			<div
				class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
			>
				<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
					Páginas Más Visitadas
				</h3>
				{#if data.stats.charts.topPages.length > 0}
					<EChart options={barChartOptions} height="250px" theme={isDark ? 'dark' : 'light'} />
				{:else}
					<div class="flex h-[250px] items-center justify-center text-gray-500 dark:text-gray-400">
						No hay datos disponibles
					</div>
				{/if}
			</div>

			<!-- Device Breakdown -->
			<div
				class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
			>
				<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
					Distribución por Dispositivo
				</h3>
				{#if data.stats.charts.deviceBreakdown.length > 0}
					<EChart options={pieChartOptions} height="250px" theme={isDark ? 'dark' : 'light'} />
				{:else}
					<div class="flex h-[250px] items-center justify-center text-gray-500 dark:text-gray-400">
						No hay datos disponibles
					</div>
				{/if}
			</div>
		</div>

		<!-- Actividad por Hora -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
		>
			<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
				Actividad por Hora (Hoy)
			</h3>
			<EChart options={hourlyChartOptions} height="200px" theme={isDark ? 'dark' : 'light'} />
		</div>

		<!-- Additional Stats Row -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Bounce Rate -->
			<div
				class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
			>
				<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Tasa de Rebote</h3>
				<div class="flex items-center gap-4">
					<div class="text-4xl font-bold text-gray-900 dark:text-white">
						{data.stats.today.bounceRate.toFixed(1)}%
					</div>
					<div class="text-sm text-gray-500 dark:text-gray-400">
						Porcentaje de sesiones con una sola página vista
					</div>
				</div>
				<div class="mt-4 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
					<div
						class="h-2 rounded-full {data.stats.today.bounceRate > 70
							? 'bg-red-500'
							: data.stats.today.bounceRate > 50
								? 'bg-yellow-500'
								: 'bg-green-500'}"
						style="width: {Math.min(data.stats.today.bounceRate, 100)}%"
					></div>
				</div>
			</div>

			<!-- Browser Breakdown -->
			<div
				class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
			>
				<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Navegadores</h3>
				<div class="space-y-3">
					{#each data.stats.charts.browserBreakdown as browser (browser.browser)}
						{#if browser.count > 0}
							{@const total = data.stats.charts.browserBreakdown.reduce(
								(acc: number, b: { count: number }) => acc + b.count,
								0
							)}
							{@const percentage = total > 0 ? (browser.count / total) * 100 : 0}
							<div class="flex items-center gap-3">
								<div class="w-20 text-sm font-medium text-gray-700 dark:text-gray-300">
									{browser.browser}
								</div>
								<div class="flex-1">
									<div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
										<div class="bg-primary-500 h-2 rounded-full" style="width: {percentage}%"></div>
									</div>
								</div>
								<div class="w-16 text-right text-sm text-gray-500 dark:text-gray-400">
									{percentage.toFixed(1)}%
								</div>
							</div>
						{:else}
							<div class="text-center text-gray-500 dark:text-gray-400">
								No hay datos disponibles
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- TAB: Users -->
	{#if activeTab === 'users'}
		<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
			<!-- Usuarios Autenticados -->
			<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
				<div
					class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700"
				>
					<h3 class="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
						<User class="h-5 w-5" />
						Usuarios Activos
						<Badge color="blue">{data.totalActiveUsers}</Badge>
					</h3>
				</div>
				<div class="divide-y divide-gray-200 dark:divide-gray-700">
					{#each data.activeUsers as userActivity (userActivity.userId)}
						<a
							href={resolve(`/admin/analytics/user/${userActivity.userId}`)}
							class="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
						>
							<Avatar
								src={userActivity.image ?? undefined}
								alt={userActivity.username || userActivity.email}
								class="h-10 w-10"
							/>
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium text-gray-900 dark:text-white">
									{userActivity.alias || userActivity.username || userActivity.email}
								</p>
								<p class="truncate text-sm text-gray-500 dark:text-gray-400">
									{userActivity.lastPath || 'Sin actividad reciente'}
								</p>
							</div>
							<div class="text-right">
								<p class="text-sm font-medium text-gray-900 dark:text-white">
									{userActivity.totalPageViews} páginas
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{formatRelativeTime(userActivity.lastSeen)}
								</p>
							</div>
							<div class="flex items-center gap-2 text-gray-400">
								{#if userActivity.device === 'desktop'}
									<Monitor class="h-4 w-4" />
								{:else if userActivity.device === 'mobile'}
									<Smartphone class="h-4 w-4" />
								{:else if userActivity.device === 'tablet'}
									<Tablet class="h-4 w-4" />
								{:else}
									<Globe class="h-4 w-4" />
								{/if}
								<ChevronRight class="h-4 w-4" />
							</div>
						</a>
					{:else}
						<div class="flex h-32 items-center justify-center text-gray-500 dark:text-gray-400">
							No hay usuarios activos en este período
						</div>
					{/each}
				</div>
			</div>

			<!-- Visitantes Anónimos -->
			<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
				<div
					class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700"
				>
					<h3 class="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
						<UserX class="h-5 w-5" />
						Visitantes Anónimos
						<Badge color="gray">{data.anonymousVisitors.length}</Badge>
					</h3>
				</div>
				<div class="divide-y divide-gray-200 dark:divide-gray-700">
					{#each data.anonymousVisitors as visitor (visitor.visitorId)}
						{#if visitor.visitorId}
							<div class="flex items-center gap-4 px-5 py-4">
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700"
								>
									<Globe class="h-5 w-5 text-gray-500 dark:text-gray-400" />
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate font-mono text-sm text-gray-900 dark:text-white">
										{visitor.visitorId.slice(0, 8)}...
									</p>
									<p class="truncate text-sm text-gray-500 dark:text-gray-400">
										{visitor.lastPath || 'Sin actividad'}
									</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-medium text-gray-900 dark:text-white">
										{visitor.totalPageViews} páginas
									</p>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{formatRelativeTime(visitor.lastSeen)}
									</p>
								</div>
								{#if visitor.device === 'desktop'}
									<Monitor class="h-4 w-4 text-gray-400" />
								{:else if visitor.device === 'mobile'}
									<Smartphone class="h-4 w-4 text-gray-400" />
								{:else if visitor.device === 'tablet'}
									<Tablet class="h-4 w-4 text-gray-400" />
								{:else}
									<Globe class="h-4 w-4 text-gray-400" />
								{/if}
							</div>
						{:else}
							<div class="flex h-32 items-center justify-center text-gray-500 dark:text-gray-400">
								No hay visitantes anónimos en este período
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- TAB: Activity -->
	{#if activeTab === 'activity'}
		<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
			<div
				class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700"
			>
				<h3 class="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
					<Activity class="h-5 w-5" />
					Actividad Reciente
					<Badge color="purple">{data.totalEvents} eventos</Badge>
				</h3>
			</div>
			<div class="overflow-x-auto">
				<Table hoverable={true}>
					<TableHead>
						<TableHeadCell>Hora</TableHeadCell>
						<TableHeadCell>Tipo</TableHeadCell>
						<TableHeadCell>Usuario</TableHeadCell>
						<TableHeadCell>Página</TableHeadCell>
						<TableHeadCell>Evento</TableHeadCell>
					</TableHead>
					<TableBody>
						{#each data.recentEvents as event (event.id)}
							{#if event}
								<TableBodyRow>
									<TableBodyCell class="whitespace-nowrap">
										<span class="text-sm text-gray-500 dark:text-gray-400">
											{formatDateTime(event.createdAt)}
										</span>
									</TableBodyCell>
									<TableBodyCell>
										<Badge color={getEventTypeColor(event.type)}>
											{getEventTypeName(event.type)}
										</Badge>
									</TableBodyCell>
									<TableBodyCell>
										{#if event.userId}
											<a
												href={resolve(`/admin/analytics/user/${event.userId}`)}
												class="flex items-center gap-2 hover:underline"
											>
												<User class="h-4 w-4 text-gray-400" />
												<span class="text-sm text-gray-900 dark:text-white">
													{event.userName || event.userEmail || 'Usuario'}
												</span>
											</a>
										{:else}
											<span
												class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
											>
												<Globe class="h-4 w-4" />
												Anónimo
											</span>
										{/if}
									</TableBodyCell>
									<TableBodyCell>
										<span
											class="max-w-xs truncate text-sm text-gray-700 dark:text-gray-300"
											title={event.path || ''}
										>
											{event.path || '-'}
										</span>
									</TableBodyCell>
									<TableBodyCell>
										<span class="text-sm text-gray-500 dark:text-gray-400">
											{event.title || event.name}
										</span>
									</TableBodyCell>
								</TableBodyRow>
							{:else}
								<TableBodyRow>
									<TableBodyCell colspan={5} class="py-8 text-center">
										<div class="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
											<Activity class="h-8 w-8" />
											<p>No hay actividad reciente</p>
										</div>
									</TableBodyCell>
								</TableBodyRow>
							{/if}
						{/each}
					</TableBody>
				</Table>
			</div>
		</div>
	{/if}
</div>
