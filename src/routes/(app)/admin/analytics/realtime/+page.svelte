<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { Button, Badge, Alert } from 'flowbite-svelte';
	import {
		Users,
		Activity,
		Radio,
		ArrowLeft,
		RefreshCw,
		AlertTriangle,
		Globe
	} from 'lucide-svelte';

	interface RealtimeStats {
		activeUsers: number;
		activeSessions: number;
		currentPages: { path: string; count: number; title?: string }[];
		eventsPerMinute: number;
		timestamp: number;
		enabled?: boolean;
		error?: string;
	}

	let stats = $state<RealtimeStats | null>(null);
	let connected = $state(false);
	let error = $state<string | null>(null);
	let eventSource: EventSource | null = null;
	let lastUpdate = $state<Date | null>(null);

	// Breadcrumb
	$effect(() => {
		breadcrumb.set([
			{ label: 'Admin', href: '/admin' },
			{ label: 'Analytics', href: '/admin/analytics' },
			{ label: 'Tiempo Real', href: '/admin/analytics/realtime' }
		]);
	});

	function connect() {
		if (eventSource) {
			eventSource.close();
		}

		error = null;
		eventSource = new EventSource('/api/analytics/realtime');

		eventSource.onopen = () => {
			connected = true;
			error = null;
		};

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.error) {
					error = data.error;
				} else {
					stats = data;
					lastUpdate = new Date();
				}
			} catch (e) {
				console.error('Error parsing SSE data:', e);
			}
		};

		eventSource.onerror = () => {
			connected = false;
			error = 'Conexión perdida. Reconectando...';
			// EventSource reconecta automáticamente
		};
	}

	function disconnect() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		connected = false;
	}

	onMount(() => {
		connect();
	});

	onDestroy(() => {
		disconnect();
	});

	function formatTime(date: Date | null): string {
		if (!date) return '--:--:--';
		return date.toLocaleTimeString('es-ES');
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-4">
			<a href="/admin/analytics">
				<Button color="alternative" size="sm" class="flex items-center gap-2">
					<ArrowLeft class="h-4 w-4" />
					Volver
				</Button>
			</a>
			<div>
				<h1 class="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
					<Radio class="h-6 w-6 text-red-500 {connected ? 'animate-pulse' : ''}" />
					Tiempo Real
				</h1>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Actividad en vivo de usuarios</p>
			</div>
		</div>
		<div class="flex items-center gap-3">
			<Badge color={connected ? 'green' : 'red'} class="flex items-center gap-1">
				<span class="h-2 w-2 rounded-full {connected ? 'bg-green-500' : 'bg-red-500'}"></span>
				{connected ? 'Conectado' : 'Desconectado'}
			</Badge>
			{#if lastUpdate}
				<span class="text-sm text-gray-500 dark:text-gray-400">
					Última actualización: {formatTime(lastUpdate)}
				</span>
			{/if}
		</div>
	</div>

	<!-- Alert si está desactivado -->
	{#if stats && stats.enabled === false}
		<Alert color="yellow" class="flex items-center gap-3">
			{#snippet icon()}
				<AlertTriangle class="h-5 w-5" />
			{/snippet}
			<div>
				<span class="font-medium">El sistema de analítica está desactivado.</span>
				No se están recopilando datos nuevos.
				<a href="/admin/settings" class="ml-2 font-medium underline hover:no-underline">
					Ir a Configuración para activarlo
				</a>
			</div>
		</Alert>
	{/if}

	<!-- Error -->
	{#if error}
		<Alert color="red" class="flex items-center gap-3">
			{#snippet icon()}
				<AlertTriangle class="h-5 w-5" />
			{/snippet}
			{error}
		</Alert>
	{/if}

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<!-- Active Users -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-500 dark:text-gray-400">Usuarios Activos</p>
					<p class="mt-2 text-4xl font-bold text-gray-900 dark:text-white">
						{stats?.activeUsers ?? 0}
					</p>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">En los últimos 5 minutos</p>
				</div>
				<div
					class="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400"
				>
					<Users class="h-7 w-7" />
				</div>
			</div>
		</div>

		<!-- Active Sessions -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-500 dark:text-gray-400">Sesiones Activas</p>
					<p class="mt-2 text-4xl font-bold text-gray-900 dark:text-white">
						{stats?.activeSessions ?? 0}
					</p>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Sesiones abiertas</p>
				</div>
				<div
					class="flex h-14 w-14 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
				>
					<Activity class="h-7 w-7" />
				</div>
			</div>
		</div>

		<!-- Events per Minute -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-500 dark:text-gray-400">Eventos/Minuto</p>
					<p class="mt-2 text-4xl font-bold text-gray-900 dark:text-white">
						{stats?.eventsPerMinute ?? 0}
					</p>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Último minuto</p>
				</div>
				<div
					class="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400"
				>
					<RefreshCw class="h-7 w-7" />
				</div>
			</div>
		</div>
	</div>

	<!-- Current Pages -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
		<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
			<Globe class="h-5 w-5" />
			Páginas Activas Ahora
		</h3>

		{#if stats?.currentPages && stats.currentPages.length > 0}
			<div class="space-y-3">
				{#each stats.currentPages as page}
					<div
						class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium text-gray-900 dark:text-white">
								{page.path}
							</p>
							{#if page.title}
								<p class="truncate text-sm text-gray-500 dark:text-gray-400">
									{page.title}
								</p>
							{/if}
						</div>
						<Badge color="blue" class="ml-3 flex-shrink-0">
							{page.count}
							{page.count === 1 ? 'usuario' : 'usuarios'}
						</Badge>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex h-32 items-center justify-center text-gray-500 dark:text-gray-400">
				<div class="text-center">
					<Users class="mx-auto mb-2 h-8 w-8 opacity-50" />
					<p>No hay usuarios activos en este momento</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Live indicator -->
	<div class="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
		<span class="relative flex h-3 w-3">
			<span
				class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"
			></span>
			<span class="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
		</span>
		Actualizando cada 5 segundos
	</div>
</div>
