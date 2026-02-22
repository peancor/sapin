<script lang="ts">
	import { goto } from '$app/navigation';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import {
		Button,
		Alert,
		Badge,
		Input,
		Select,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Modal,
		Spinner
	} from 'flowbite-svelte';
	import {
		ScrollText,
		Search,
		Filter,
		AlertTriangle,
		Settings,
		Trash2,
		RefreshCw,
		User,
		ChevronLeft,
		ChevronRight,
		Info,
		AlertCircle,
		XCircle,
		Clock,
		Activity
	} from 'lucide-svelte';

	let { data } = $props();

	// State
	let searchQuery = $state(data.filters.search || '');
	let selectedAction = $state(data.filters.action || '');
	let selectedSeverity = $state(data.filters.severity || '');
	let startDate = $state(data.filters.startDate || '');
	let endDate = $state(data.filters.endDate || '');
	let showCleanupModal = $state(false);
	let isCleaningUp = $state(false);
	let cleanupResult = $state<{ success: boolean; deleted?: number; error?: string } | null>(null);
	let showDetailsModal = $state(false);
	let selectedLog = $state<(typeof data.logs)[0] | null>(null);

	// Breadcrumb
	$effect(() => {
		breadcrumb.set([
			{ label: 'Admin', href: '/admin' },
			{ label: 'Audit Logs', href: '/admin/logs' }
		]);
	});

	// Stats cards
	const statCards = $derived([
		{
			title: 'Total Registros',
			value: data.stats.total,
			icon: ScrollText,
			color: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
		},
		{
			title: 'Ultimas 24h',
			value: data.stats.last24Hours,
			icon: Clock,
			color: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
		},
		{
			title: 'Ultimos 7 dias',
			value: data.stats.last7Days,
			icon: Activity,
			color: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400'
		},
		{
			title: 'Errores Criticos',
			value: (data.stats.bySeverity['critical'] || 0) + (data.stats.bySeverity['error'] || 0),
			icon: AlertCircle,
			color: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400'
		}
	]);

	// Pagination
	const totalPages = $derived(Math.ceil(data.total / data.limit));
	const currentPage = $derived(data.page);

	// Helpers
	function getSeverityColor(
		severity: string | null
	): 'blue' | 'yellow' | 'red' | 'green' | 'indigo' | 'purple' | 'pink' {
		switch (severity) {
			case 'info':
				return 'blue';
			case 'warning':
				return 'yellow';
			case 'error':
				return 'red';
			case 'critical':
				return 'indigo';
			default:
				return 'blue';
		}
	}

	function getSeverityIcon(severity: string | null) {
		switch (severity) {
			case 'info':
				return Info;
			case 'warning':
				return AlertTriangle;
			case 'error':
				return AlertCircle;
			case 'critical':
				return XCircle;
			default:
				return Info;
		}
	}

	function formatDateTime(date: Date | string): string {
		const d = new Date(date);
		return d.toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatActionName(action: string): string {
		return action
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (l) => l.toUpperCase());
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		if (selectedAction) params.set('action', selectedAction);
		if (selectedSeverity) params.set('severity', selectedSeverity);
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function clearFilters() {
		searchQuery = '';
		selectedAction = '';
		selectedSeverity = '';
		startDate = '';
		endDate = '';
		goto('/admin/logs');
	}

	function goToPage(page: number) {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		if (selectedAction) params.set('action', selectedAction);
		if (selectedSeverity) params.set('severity', selectedSeverity);
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);
		params.set('page', String(page));
		goto(`?${params.toString()}`);
	}

	async function handleCleanup() {
		isCleaningUp = true;
		cleanupResult = null;

		try {
			const response = await fetch('/admin/logs?/cleanup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
			});

			const result = await response.json();

			if (result.type === 'success') {
				cleanupResult = { success: true, deleted: result.data?.deleted || 0 };
				// Recargar la pagina para ver cambios
				setTimeout(() => {
					showCleanupModal = false;
					goto('/admin/logs');
				}, 2000);
			} else {
				cleanupResult = { success: false, error: result.data?.error || 'Error desconocido' };
			}
		} catch (err) {
			cleanupResult = { success: false, error: 'Error de conexion' };
		} finally {
			isCleaningUp = false;
		}
	}

	function showLogDetails(log: (typeof data.logs)[0]) {
		selectedLog = log;
		showDetailsModal = true;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h1>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Registro de acciones importantes del sistema
			</p>
		</div>
		<div class="flex gap-2">
			<a href="/admin/logs/settings">
				<Button color="alternative" class="flex items-center gap-2">
					<Settings class="h-4 w-4" />
					Configuracion
				</Button>
			</a>
			<Button
				color="red"
				outline
				class="flex items-center gap-2"
				onclick={() => (showCleanupModal = true)}
			>
				<Trash2 class="h-4 w-4" />
				Limpiar Antiguos
			</Button>
		</div>
	</div>

	<!-- Alert si esta desactivado -->
	{#if !data.config.enabled}
		<Alert color="yellow" class="flex items-center gap-3">
			{#snippet icon()}
				<AlertTriangle class="h-5 w-5" />
			{/snippet}
			<div>
				<span class="font-medium">El sistema de auditoria esta desactivado.</span>
				No se estan registrando nuevas acciones.
				<a href="/admin/logs/settings" class="ml-2 font-medium underline hover:no-underline">
					Ir a Configuracion para activarlo
				</a>
			</div>
		</Alert>
	{/if}

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
							{card.value.toLocaleString()}
						</p>
					</div>
					<div class="flex h-12 w-12 items-center justify-center rounded-lg {card.color}">
						<card.icon class="h-6 w-6" />
					</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Filters -->
	<div
		class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
	>
		<div class="flex flex-wrap items-end gap-4">
			<!-- Search -->
			<div class="min-w-[200px] flex-1">
				<label
					for="logs-search"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Buscar
				</label>
				<Input
					id="logs-search"
					type="search"
					placeholder="Buscar en logs..."
					bind:value={searchQuery}
				>
					{#snippet left()}
						<Search class="h-4 w-4 text-gray-400" />
					{/snippet}
				</Input>
			</div>

			<!-- Action filter -->
			<div class="w-48">
				<label
					for="logs-action"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Accion
				</label>
				<Select id="logs-action" bind:value={selectedAction}>
					<option value="">Todas las acciones</option>
					{#each data.availableActions as action}
						<option value={action}>{formatActionName(action)}</option>
					{/each}
				</Select>
			</div>

			<!-- Severity filter -->
			<div class="w-40">
				<label
					for="logs-severity"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Severidad
				</label>
				<Select id="logs-severity" bind:value={selectedSeverity}>
					<option value="">Todas</option>
					<option value="info">Info</option>
					<option value="warning">Warning</option>
					<option value="error">Error</option>
					<option value="critical">Critical</option>
				</Select>
			</div>

			<!-- Date range -->
			<div class="w-40">
				<label
					for="logs-start-date"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Desde
				</label>
				<Input id="logs-start-date" type="date" bind:value={startDate} />
			</div>
			<div class="w-40">
				<label
					for="logs-end-date"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Hasta
				</label>
				<Input id="logs-end-date" type="date" bind:value={endDate} />
			</div>

			<!-- Buttons -->
			<div class="flex gap-2">
				<Button color="primary" class="flex items-center gap-2" onclick={applyFilters}>
					<Filter class="h-4 w-4" />
					Filtrar
				</Button>
				<Button color="alternative" class="flex items-center gap-2" onclick={clearFilters}>
					<RefreshCw class="h-4 w-4" />
					Limpiar
				</Button>
			</div>
		</div>
	</div>

	<!-- Results count -->
	<div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
		<span>
			Mostrando {((currentPage - 1) * data.limit) + 1} - {Math.min(currentPage * data.limit, data.total)} de {data.total.toLocaleString()} registros
		</span>
		<span>
			Retencion: {data.config.retentionDays} dias
		</span>
	</div>

	<!-- Table -->
	<div class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
		<div class="overflow-x-auto">
			<Table hoverable={true}>
				<TableHead>
					<TableHeadCell>Fecha/Hora</TableHeadCell>
					<TableHeadCell>Severidad</TableHeadCell>
					<TableHeadCell>Accion</TableHeadCell>
					<TableHeadCell>Usuario</TableHeadCell>
					<TableHeadCell>Objetivo</TableHeadCell>
					<TableHeadCell>IP</TableHeadCell>
					<TableHeadCell>
						<span class="sr-only">Acciones</span>
					</TableHeadCell>
				</TableHead>
				<TableBody>
					{#each data.logs as log (log.id)}
						<TableBodyRow class="cursor-pointer" onclick={() => showLogDetails(log)}>
							<TableBodyCell class="whitespace-nowrap">
								<span class="text-sm text-gray-700 dark:text-gray-300">
									{formatDateTime(log.timestamp)}
								</span>
							</TableBodyCell>
							<TableBodyCell>
								<Badge color={getSeverityColor(log.severity)} class="flex w-fit items-center gap-1">
									{@const Icon = getSeverityIcon(log.severity)}
									<Icon class="h-3 w-3" />
									{log.severity || 'info'}
								</Badge>
							</TableBodyCell>
							<TableBodyCell>
								<span class="font-medium text-gray-900 dark:text-white">
									{formatActionName(log.action)}
								</span>
							</TableBodyCell>
							<TableBodyCell>
								{#if log.userId}
									<div class="flex items-center gap-2">
										<User class="h-4 w-4 text-gray-400" />
										<span class="text-sm text-gray-700 dark:text-gray-300">
											{log.userName || log.userEmail || log.userId.slice(0, 8)}
										</span>
									</div>
								{:else}
									<span class="text-sm text-gray-400">Sistema</span>
								{/if}
							</TableBodyCell>
							<TableBodyCell>
								{#if log.targetType || log.targetId}
									<span class="text-sm text-gray-500 dark:text-gray-400">
										{log.targetType || ''}{log.targetId ? `: ${log.targetId.slice(0, 8)}...` : ''}
									</span>
								{:else}
									<span class="text-sm text-gray-400">-</span>
								{/if}
							</TableBodyCell>
							<TableBodyCell>
								<span class="font-mono text-xs text-gray-500 dark:text-gray-400">
									{log.ipAddress || '-'}
								</span>
							</TableBodyCell>
							<TableBodyCell>
								<Button size="xs" color="alternative" onclick={() => showLogDetails(log)}>
									Ver
								</Button>
							</TableBodyCell>
						</TableBodyRow>
					{:else}
						<TableBodyRow>
							<TableBodyCell colspan={7} class="py-12 text-center">
								<div class="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
									<ScrollText class="h-12 w-12" />
									<p class="text-lg font-medium">No hay registros</p>
									<p class="text-sm">No se encontraron logs con los filtros aplicados</p>
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div
				class="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700"
			>
				<Button
					color="alternative"
					size="sm"
					disabled={currentPage <= 1}
					onclick={() => goToPage(currentPage - 1)}
				>
					<ChevronLeft class="mr-1 h-4 w-4" />
					Anterior
				</Button>

				<div class="flex items-center gap-2">
					{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
						const start = Math.max(1, currentPage - 2);
						const end = Math.min(totalPages, start + 4);
						const adjustedStart = Math.max(1, end - 4);
						return adjustedStart + i;
					}).filter((p) => p <= totalPages) as pageNum}
						<button
							type="button"
							class="h-8 w-8 rounded text-sm font-medium transition-colors {pageNum ===
							currentPage
								? 'bg-primary-600 text-white'
								: 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}"
							onclick={() => goToPage(pageNum)}
						>
							{pageNum}
						</button>
					{/each}
				</div>

				<Button
					color="alternative"
					size="sm"
					disabled={currentPage >= totalPages}
					onclick={() => goToPage(currentPage + 1)}
				>
					Siguiente
					<ChevronRight class="ml-1 h-4 w-4" />
				</Button>
			</div>
		{/if}
	</div>
</div>

<!-- Cleanup Modal -->
<Modal title="Limpiar Logs Antiguos" bind:open={showCleanupModal} size="md">
	<div class="space-y-4">
		{#if cleanupResult}
			{#if cleanupResult.success}
				<Alert color="green">
					Se eliminaron {cleanupResult.deleted?.toLocaleString()} registros antiguos.
				</Alert>
			{:else}
				<Alert color="red">
					Error: {cleanupResult.error}
				</Alert>
			{/if}
		{:else}
			<p class="text-gray-700 dark:text-gray-300">
				Esta accion eliminara todos los logs de auditoria con mas de <strong
					>{data.config.retentionDays} dias</strong
				> de antiguedad.
			</p>
			<Alert color="yellow">
				{#snippet icon()}
					<AlertTriangle class="h-5 w-5" />
				{/snippet}
				Esta accion no se puede deshacer.
			</Alert>
		{/if}
	</div>
	{#snippet footer()}
		<div class="flex justify-end gap-2">
			<Button color="alternative" onclick={() => (showCleanupModal = false)}>Cancelar</Button>
			<Button color="red" onclick={handleCleanup} disabled={isCleaningUp || cleanupResult?.success}>
				{#if isCleaningUp}
					<Spinner size="4" class="mr-2" />
				{/if}
				Eliminar Logs Antiguos
			</Button>
		</div>
	{/snippet}
</Modal>

<!-- Details Modal -->
<Modal title="Detalles del Log" bind:open={showDetailsModal} size="lg">
	{#if selectedLog}
		<div class="space-y-4">
			<div class="grid grid-cols-2 gap-4">
				<div>
					<span class="text-sm font-medium text-gray-500 dark:text-gray-400">ID</span>
					<p class="font-mono text-sm text-gray-900 dark:text-white">{selectedLog.id}</p>
				</div>
				<div>
					<span class="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha/Hora</span>
					<p class="text-sm text-gray-900 dark:text-white">
						{formatDateTime(selectedLog.timestamp)}
					</p>
				</div>
				<div>
					<span class="text-sm font-medium text-gray-500 dark:text-gray-400">Accion</span>
					<p class="text-sm text-gray-900 dark:text-white">
						{formatActionName(selectedLog.action)}
					</p>
				</div>
				<div>
					<span class="text-sm font-medium text-gray-500 dark:text-gray-400">Severidad</span>
					<Badge color={getSeverityColor(selectedLog.severity)}>
						{selectedLog.severity || 'info'}
					</Badge>
				</div>
				<div>
					<span class="text-sm font-medium text-gray-500 dark:text-gray-400">Usuario</span>
					<p class="text-sm text-gray-900 dark:text-white">
						{selectedLog.userName || selectedLog.userEmail || selectedLog.userId || 'Sistema'}
					</p>
				</div>
				<div>
					<span class="text-sm font-medium text-gray-500 dark:text-gray-400">IP</span>
					<p class="font-mono text-sm text-gray-900 dark:text-white">
						{selectedLog.ipAddress || '-'}
					</p>
				</div>
				{#if selectedLog.targetType}
					<div>
						<span class="text-sm font-medium text-gray-500 dark:text-gray-400">
							Tipo Objetivo
						</span>
						<p class="text-sm text-gray-900 dark:text-white">{selectedLog.targetType}</p>
					</div>
				{/if}
				{#if selectedLog.targetId}
					<div>
						<span class="text-sm font-medium text-gray-500 dark:text-gray-400">ID Objetivo</span>
						<p class="font-mono text-sm text-gray-900 dark:text-white">{selectedLog.targetId}</p>
					</div>
				{/if}
			</div>

			{#if selectedLog.userAgent}
				<div>
					<span class="text-sm font-medium text-gray-500 dark:text-gray-400">User Agent</span>
					<p class="text-xs text-gray-700 break-all dark:text-gray-300">{selectedLog.userAgent}</p>
				</div>
			{/if}

			{#if selectedLog.details}
				<div>
					<span class="text-sm font-medium text-gray-500 dark:text-gray-400">Detalles</span>
					<pre
						class="mt-1 max-h-64 overflow-auto rounded-lg bg-gray-100 p-3 text-xs dark:bg-gray-700">{JSON.stringify(selectedLog.details, null, 2)}</pre>
				</div>
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		<Button color="alternative" onclick={() => (showDetailsModal = false)}>Cerrar</Button>
	{/snippet}
</Modal>
