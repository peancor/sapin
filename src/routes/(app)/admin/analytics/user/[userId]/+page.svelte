<script lang="ts">
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import {
		Button,
		Badge,
		Avatar,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell
	} from 'flowbite-svelte';
	import {
		ArrowLeft,
		User,
		Clock,
		Eye,
		Activity,
		Calendar,
		Monitor,
		Smartphone,
		Tablet,
		Globe,
		Mail
	} from 'lucide-svelte';
	import EChart from '$lib/components/charts/EChart.svelte';

	let { data } = $props();
	const { userActivity } = data;

	// Detectar tema
	let isDark = $state(false);

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
			{ label: 'Analytics', href: '/admin/analytics' },
			{
				label: userActivity.user.alias || userActivity.user.username || userActivity.user.email,
				href: ''
			}
		]);
	});

	// Gráfico de actividad por día
	const activityChartOptions = $derived({
		tooltip: {
			trigger: 'axis',
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' }
		},
		grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
		xAxis: {
			type: 'category',
			data: userActivity.activityByDay.map((d: { date: string }) => formatDate(d.date)),
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
				type: 'bar',
				data: userActivity.activityByDay.map((d: { pageViews: number }) => d.pageViews),
				itemStyle: {
					color: '#3b82f6',
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
		if (mins < 60) return `${mins}:${secs.toString().padStart(2, '0')}`;
		const hours = Math.floor(mins / 60);
		const remainingMins = mins % 60;
		return `${hours}h ${remainingMins}m`;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
	}

	function formatDateTime(date: Date | string | null): string {
		if (!date) return '-';
		const d = new Date(date);
		return d.toLocaleString('es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatRelativeTime(date: Date | string | null): string {
		if (!date) return '-';
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
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-4">
			<a href="/admin/analytics?tab=users">
				<Button color="alternative" size="sm" class="flex items-center gap-2">
					<ArrowLeft class="h-4 w-4" />
					Volver
				</Button>
			</a>
			<div class="flex items-center gap-4">
				<Avatar
					src={userActivity.user.image ?? '/images/default_avatar.png'}
					alt={userActivity.user.username || userActivity.user.email}
					size="lg"
				/>
				<div>
					<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
						{userActivity.user.alias || userActivity.user.username || userActivity.user.email}
					</h1>
					<div class="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
						<Mail class="h-4 w-4" />
						{userActivity.user.email}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		<div
			class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400"
				>
					<Activity class="h-5 w-5" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Sesiones</p>
					<p class="text-xl font-bold text-gray-900 dark:text-white">
						{userActivity.stats.totalSessions}
					</p>
				</div>
			</div>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
				>
					<Eye class="h-5 w-5" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Páginas Vistas</p>
					<p class="text-xl font-bold text-gray-900 dark:text-white">
						{userActivity.stats.totalPageViews}
					</p>
				</div>
			</div>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400"
				>
					<Clock class="h-5 w-5" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Tiempo Total</p>
					<p class="text-xl font-bold text-gray-900 dark:text-white">
						{formatDuration(userActivity.stats.totalDuration)}
					</p>
				</div>
			</div>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400"
				>
					<Calendar class="h-5 w-5" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Última Visita</p>
					<p class="text-xl font-bold text-gray-900 dark:text-white">
						{formatRelativeTime(userActivity.stats.lastSeen)}
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Actividad por día -->
	<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
		<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
			Actividad (últimos 30 días)
		</h3>
		{#if userActivity.activityByDay.length > 0}
			<EChart options={activityChartOptions} height="200px" theme={isDark ? 'dark' : 'light'} />
		{:else}
			<div class="flex h-[200px] items-center justify-center text-gray-500 dark:text-gray-400">
				No hay actividad registrada
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Páginas más visitadas -->
		<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
			<div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Páginas Más Visitadas</h3>
			</div>
			<div class="divide-y divide-gray-200 dark:divide-gray-700">
				{#each userActivity.topPages as page}
					<div class="flex items-center justify-between px-5 py-3">
						<span class="truncate text-sm text-gray-700 dark:text-gray-300" title={page.path}>
							{page.path}
						</span>
						<Badge color="blue">{page.views}</Badge>
					</div>
				{:else}
					<div class="flex h-24 items-center justify-center text-gray-500 dark:text-gray-400">
						Sin datos
					</div>
				{/each}
			</div>
		</div>

		<!-- Sesiones recientes -->
		<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
			<div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Sesiones Recientes</h3>
			</div>
			<div class="divide-y divide-gray-200 dark:divide-gray-700">
				{#each userActivity.recentSessions as session}
					<div class="flex items-center justify-between px-5 py-3">
						<div class="flex items-center gap-3">
							{#if session.device === 'desktop'}
								<Monitor class="h-4 w-4 text-gray-400" />
							{:else if session.device === 'mobile'}
								<Smartphone class="h-4 w-4 text-gray-400" />
							{:else if session.device === 'tablet'}
								<Tablet class="h-4 w-4 text-gray-400" />
							{:else}
								<Globe class="h-4 w-4 text-gray-400" />
							{/if}
							<div>
								<p class="text-sm text-gray-700 dark:text-gray-300">
									{formatDateTime(session.startedAt)}
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{session.browser || 'Desconocido'} - {session.os || 'Desconocido'}
								</p>
							</div>
						</div>
						<div class="text-right">
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								{session.pageViews} páginas
							</p>
							{#if session.duration}
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{formatDuration(session.duration)}
								</p>
							{/if}
						</div>
					</div>
				{:else}
					<div class="flex h-24 items-center justify-center text-gray-500 dark:text-gray-400">
						Sin sesiones
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Eventos recientes -->
	<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
		<div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Eventos Recientes</h3>
		</div>
		<div class="overflow-x-auto">
			<Table hoverable={true}>
				<TableHead>
					<TableHeadCell>Hora</TableHeadCell>
					<TableHeadCell>Tipo</TableHeadCell>
					<TableHeadCell>Página</TableHeadCell>
					<TableHeadCell>Evento</TableHeadCell>
				</TableHead>
				<TableBody>
					{#each userActivity.recentEvents as event}
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
							<TableBodyCell colspan={4} class="text-center py-8">
								<div class="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
									<Activity class="h-8 w-8" />
									<p>No hay eventos recientes</p>
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		</div>
	</div>

	<!-- Info adicional -->
	<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
		<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
			Información del Usuario
		</h3>
		<dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div>
				<dt class="text-sm text-gray-500 dark:text-gray-400">Primera visita</dt>
				<dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
					{formatDateTime(userActivity.stats.firstSeen)}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-gray-500 dark:text-gray-400">Última visita</dt>
				<dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
					{formatDateTime(userActivity.stats.lastSeen)}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-gray-500 dark:text-gray-400">Duración media por sesión</dt>
				<dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
					{formatDuration(userActivity.stats.avgSessionDuration)}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-gray-500 dark:text-gray-400">Cuenta creada</dt>
				<dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
					{formatDateTime(userActivity.user.createdAt)}
				</dd>
			</div>
		</dl>
	</div>
</div>
