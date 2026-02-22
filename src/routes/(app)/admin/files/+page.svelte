<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import {
		Button,
		Badge,
		Input,
		Table,
		TableHead,
		TableHeadCell,
		TableBody,
		TableBodyRow,
		TableBodyCell,
		Select,
		Checkbox,
		Modal,
		Spinner,
		Alert
	} from 'flowbite-svelte';
	import {
		Files,
		HardDrive,
		Clock,
		AlertTriangle,
		Trash2,
		RefreshCw,
		Search,
		Image,
		FileText,
		File,
		Wrench,
		Play,
		RotateCcw,
		Eye,
		Download,
		Check,
		X
	} from 'lucide-svelte';
	import EChart from '$lib/components/charts/EChart.svelte';

	let { data } = $props();

	// State
	let isDark = $state(false);
	let searchQuery = $state('');
	let selectedFiles = $state<string[]>([]);
	let isMaintenanceModalOpen = $state(false);
	let isProcessingModalOpen = $state(false);
	let maintenanceLoading = $state(false);
	let maintenanceResult = $state<any>(null);
	let processingLoading = $state(false);
	let processingResult = $state<any>(null);

	// Detect theme
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
			{ label: 'Archivos', href: '/admin/files' }
		]);
	});

	// Stats cards
	const statCards = $derived([
		{
			title: 'Total Archivos',
			value: data.stats.activeFiles,
			icon: Files,
			color: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
		},
		{
			title: 'Espacio Usado',
			value: formatBytes(data.stats.activeSize),
			icon: HardDrive,
			color: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400',
			isText: true
		},
		{
			title: 'Pendientes',
			value: data.stats.pendingProcessing,
			icon: Clock,
			color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400'
		},
		{
			title: 'Huérfanos',
			value: data.stats.orphanedFiles,
			icon: AlertTriangle,
			color: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400'
		}
	]);

	// Pie chart for category distribution
	const categoryChartOptions = $derived({
		tooltip: {
			trigger: 'item',
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' },
			formatter: (params: any) => `${params.name}: ${params.value} archivos (${params.percent}%)`
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
				data: Object.entries(data.stats.byCategory).map(([name, info], i) => ({
					value: (info as { count: number }).count,
					name: getCategoryName(name),
					itemStyle: { color: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'][i] || '#6b7280' }
				}))
			}
		]
	});

	// Bar chart for space by category
	const spaceChartOptions = $derived({
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			backgroundColor: isDark ? '#1f2937' : '#fff',
			borderColor: isDark ? '#374151' : '#e5e7eb',
			textStyle: { color: isDark ? '#f3f4f6' : '#1f2937' },
			formatter: (params: any) => `${params[0].name}: ${formatBytes(params[0].value)}`
		},
		grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
		xAxis: {
			type: 'value',
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: {
				color: isDark ? '#9ca3af' : '#6b7280',
				formatter: (value: number) => formatBytes(value)
			},
			splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
		},
		yAxis: {
			type: 'category',
			data: Object.entries(data.stats.byCategory)
				.map(([name]) => getCategoryName(name))
				.reverse(),
			axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
			axisLabel: { color: isDark ? '#9ca3af' : '#6b7280' }
		},
		series: [
			{
				type: 'bar',
				data: Object.entries(data.stats.byCategory)
					.map(([, info]) => (info as { size: number }).size)
					.reverse(),
				itemStyle: {
					color: '#8b5cf6',
					borderRadius: [0, 4, 4, 0]
				}
			}
		]
	});

	// Helpers
	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function getCategoryName(category: string): string {
		const names: Record<string, string> = {
			avatar: 'Avatares',
			course: 'Cursos',
			chat: 'Chats',
			rag_document: 'RAG Docs',
			public: 'Públicos'
		};
		return names[category] || category;
	}

	function getStatusBadge(status: string): { color: 'green' | 'yellow' | 'red' | 'gray'; text: string } {
		switch (status) {
			case 'completed':
				return { color: 'green', text: 'Completado' };
			case 'pending':
				return { color: 'yellow', text: 'Pendiente' };
			case 'error':
				return { color: 'red', text: 'Fallido' };
			default:
				return { color: 'gray', text: status };
		}
	}

	function getFileIcon(mimeType: string) {
		if (mimeType.startsWith('image/')) return Image;
		if (mimeType.includes('pdf') || mimeType.includes('document')) return FileText;
		return File;
	}

	function formatDate(date: Date | string | null): string {
		if (!date) return '-';
		return new Date(date).toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Navigation handlers
	function handleSearch() {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		if (data.filters.category) params.set('category', data.filters.category);
		if (data.filters.status) params.set('status', data.filters.status);
		if (data.filters.showDeleted) params.set('showDeleted', 'true');
		if (data.filters.showOrphans) params.set('showOrphans', 'true');
		goto(`?${params.toString()}`);
	}

	function handleFilterChange(filter: string, value: string | boolean) {
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);

		const filters = { ...data.filters, [filter]: value };
		if (filters.category) params.set('category', filters.category);
		if (filters.status) params.set('status', filters.status);
		if (filters.showDeleted) params.set('showDeleted', 'true');
		if (filters.showOrphans) params.set('showOrphans', 'true');

		goto(`?${params.toString()}`);
	}

	function handlePageChange(page: number) {
		const params = new URLSearchParams(window.location.search);
		params.set('page', page.toString());
		goto(`?${params.toString()}`);
	}

	// Selection handlers
	function toggleSelectAll() {
		if (selectedFiles.length === data.files.length) {
			selectedFiles = [];
		} else {
			selectedFiles = data.files.map((f: { id: string }) => f.id);
		}
	}

	function toggleSelect(fileId: string) {
		if (selectedFiles.includes(fileId)) {
			selectedFiles = selectedFiles.filter((id) => id !== fileId);
		} else {
			selectedFiles = [...selectedFiles, fileId];
		}
	}

	// Maintenance actions
	async function runMaintenance(action: string) {
		maintenanceLoading = true;
		maintenanceResult = null;

		try {
			const response = await fetch('/api/admin/files/maintenance', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});

			maintenanceResult = await response.json();
			if (maintenanceResult.success) {
				await invalidateAll();
			}
		} catch (error) {
			maintenanceResult = { success: false, error: 'Error de conexión' };
		} finally {
			maintenanceLoading = false;
		}
	}

	// Processing actions
	async function runProcessing(action: string) {
		processingLoading = true;
		processingResult = null;

		try {
			const response = await fetch('/api/admin/files/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, fileIds: selectedFiles })
			});

			processingResult = await response.json();
			if (processingResult.success) {
				await invalidateAll();
				selectedFiles = [];
			}
		} catch (error) {
			processingResult = { success: false, error: 'Error de conexión' };
		} finally {
			processingLoading = false;
		}
	}

	// Bulk actions
	async function bulkAction(action: string) {
		if (selectedFiles.length === 0) return;

		try {
			const response = await fetch('/api/admin/files', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, fileIds: selectedFiles })
			});

			const result = await response.json();
			if (result.success) {
				await invalidateAll();
				selectedFiles = [];
			}
		} catch (error) {
			console.error('Bulk action error:', error);
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Archivos</h1>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Administra el almacenamiento, procesamiento y limpieza de archivos
			</p>
		</div>
		<div class="flex gap-2">
			<Button color="alternative" class="flex items-center gap-2" onclick={() => (isProcessingModalOpen = true)}>
				<Play class="h-4 w-4" />
				Procesamiento
			</Button>
			<Button color="primary" class="flex items-center gap-2" onclick={() => (isMaintenanceModalOpen = true)}>
				<Wrench class="h-4 w-4" />
				Mantenimiento
			</Button>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
		{#each statCards as card (card.title)}
			<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
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
			</div>
		{/each}
	</div>

	<!-- Charts Row -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Category Distribution -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
			<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
				Distribución por Categoría
			</h3>
			{#if Object.keys(data.stats.byCategory).length > 0}
				<EChart options={categoryChartOptions} height="250px" theme={isDark ? 'dark' : 'light'} />
			{:else}
				<div class="flex h-[250px] items-center justify-center text-gray-500 dark:text-gray-400">
					No hay datos disponibles
				</div>
			{/if}
		</div>

		<!-- Space by Category -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
			<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
				Espacio por Categoría
			</h3>
			{#if Object.keys(data.stats.byCategory).length > 0}
				<EChart options={spaceChartOptions} height="250px" theme={isDark ? 'dark' : 'light'} />
			{:else}
				<div class="flex h-[250px] items-center justify-center text-gray-500 dark:text-gray-400">
					No hay datos disponibles
				</div>
			{/if}
		</div>
	</div>

	<!-- Processing Stats -->
	<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
		<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Estado de Procesamiento</h3>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div class="text-center">
				<p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{data.processingStats.pending}</p>
				<p class="text-sm text-gray-500 dark:text-gray-400">Pendientes</p>
			</div>
			<div class="text-center">
				<p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.processingStats.processing}</p>
				<p class="text-sm text-gray-500 dark:text-gray-400">Procesando</p>
			</div>
			<div class="text-center">
				<p class="text-2xl font-bold text-green-600 dark:text-green-400">{data.processingStats.completed}</p>
				<p class="text-sm text-gray-500 dark:text-gray-400">Completados</p>
			</div>
			<div class="text-center">
				<p class="text-2xl font-bold text-red-600 dark:text-red-400">{data.processingStats.failed}</p>
				<p class="text-sm text-gray-500 dark:text-gray-400">Fallidos</p>
			</div>
		</div>
	</div>

	<!-- Filters and Search -->
	<div class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center dark:border-gray-700 dark:bg-gray-800">
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSearch();
			}}
			class="flex flex-1 gap-2"
		>
			<Input type="search" placeholder="Buscar archivos..." bind:value={searchQuery} class="flex-1">
				{#snippet left()}
					<Search class="h-4 w-4 text-gray-400" />
				{/snippet}
			</Input>
			<Button type="submit" color="primary" size="sm">Buscar</Button>
		</form>

		<div class="flex flex-wrap gap-2">
			<Select
				class="w-40"
				value={data.filters.category}
				onchange={(e) => handleFilterChange('category', (e.target as HTMLSelectElement).value)}
			>
				<option value="">Todas las categorías</option>
				<option value="avatar">Avatares</option>
				<option value="course">Cursos</option>
				<option value="chat">Chats</option>
				<option value="rag_document">RAG Docs</option>
				<option value="public">Públicos</option>
			</Select>

			<Select
				class="w-40"
				value={data.filters.status}
				onchange={(e) => handleFilterChange('status', (e.target as HTMLSelectElement).value)}
			>
				<option value="">Todos los estados</option>
				<option value="pending">Pendiente</option>
				<option value="completed">Completado</option>
				<option value="error">Fallido</option>
			</Select>

			<label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
				<Checkbox
					checked={data.filters.showDeleted}
					onchange={(e) => handleFilterChange('showDeleted', (e.target as HTMLInputElement).checked)}
				/>
				Eliminados
			</label>

			<label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
				<Checkbox
					checked={data.filters.showOrphans}
					onchange={(e) => handleFilterChange('showOrphans', (e.target as HTMLInputElement).checked)}
				/>
				Huérfanos
			</label>
		</div>
	</div>

	<!-- Bulk Actions -->
	{#if selectedFiles.length > 0}
		<div class="flex items-center gap-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
			<span class="text-sm font-medium text-blue-700 dark:text-blue-300">
				{selectedFiles.length} archivo(s) seleccionado(s)
			</span>
			<div class="flex gap-2">
				<Button size="xs" color="red" onclick={() => bulkAction('delete')}>
					<Trash2 class="mr-1 h-3 w-3" />
					Eliminar
				</Button>
				{#if data.filters.showDeleted}
					<Button size="xs" color="green" onclick={() => bulkAction('restore')}>
						<RotateCcw class="mr-1 h-3 w-3" />
						Restaurar
					</Button>
				{/if}
				<Button size="xs" color="alternative" onclick={() => runProcessing('reprocess')}>
					<RefreshCw class="mr-1 h-3 w-3" />
					Reprocesar
				</Button>
			</div>
		</div>
	{/if}

	<!-- Files Table -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
		<div class="overflow-x-auto">
			<Table hoverable={true}>
				<TableHead>
					<TableHeadCell class="w-10">
						<Checkbox
							checked={selectedFiles.length === data.files.length && data.files.length > 0}
							onchange={toggleSelectAll}
						/>
					</TableHeadCell>
					<TableHeadCell>Archivo</TableHeadCell>
					<TableHeadCell>Categoría</TableHeadCell>
					<TableHeadCell>Tamaño</TableHeadCell>
					<TableHeadCell>Estado</TableHeadCell>
					<TableHeadCell>Subido</TableHeadCell>
					<TableHeadCell>Acciones</TableHeadCell>
				</TableHead>
				<TableBody>
					{#each data.files as file (file.id)}
						{@const FileIcon = getFileIcon(file.mimeType)}
						{@const statusInfo = getStatusBadge(file.processingStatus)}
						<TableBodyRow class={!file.isActive ? 'opacity-50' : ''}>
							<TableBodyCell>
								<Checkbox
									checked={selectedFiles.includes(file.id)}
									onchange={() => toggleSelect(file.id)}
								/>
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
										{#if file.mimeType.startsWith('image/') && file.processingStatus === 'completed'}
											<img
												src="/api/files/{file.id}/thumbnail"
												alt=""
												class="h-10 w-10 rounded-lg object-cover"
												onerror={(e) => {
													(e.target as HTMLImageElement).style.display = 'none';
													(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
												}}
											/>
											<FileIcon class="hidden h-5 w-5 text-gray-500" />
										{:else}
											<FileIcon class="h-5 w-5 text-gray-500" />
										{/if}
									</div>
									<div class="min-w-0">
										<p class="truncate font-medium text-gray-900 dark:text-white" title={file.displayName || file.name}>
											{file.displayName || file.name}
										</p>
										<p class="truncate text-xs text-gray-500 dark:text-gray-400">
											{file.mimeType}
										</p>
									</div>
								</div>
							</TableBodyCell>
							<TableBodyCell>
								<Badge color="gray">{getCategoryName(file.category)}</Badge>
								{#if file.isOrphan}
									<Badge color="red" class="ml-1">Huérfano</Badge>
								{/if}
								{#if !file.isActive}
									<Badge color="gray" class="ml-1">Eliminado</Badge>
								{/if}
							</TableBodyCell>
							<TableBodyCell>{formatBytes(file.size)}</TableBodyCell>
							<TableBodyCell>
								<Badge color={statusInfo.color}>{statusInfo.text}</Badge>
							</TableBodyCell>
							<TableBodyCell>
								<span class="text-sm text-gray-500 dark:text-gray-400">
									{formatDate(file.uploadedAt)}
								</span>
							</TableBodyCell>
							<TableBodyCell>
								<div class="flex gap-1">
									<Button
										size="xs"
										color="alternative"
										href="/api/files/{file.id}"
										target="_blank"
										title="Ver archivo"
									>
										<Eye class="h-3 w-3" />
									</Button>
									<Button
										size="xs"
										color="alternative"
										href="/api/files/{file.id}?download=true"
										title="Descargar"
									>
										<Download class="h-3 w-3" />
									</Button>
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{:else}
						<TableBodyRow>
							<TableBodyCell colspan={7} class="py-8 text-center">
								<div class="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
									<Files class="h-8 w-8" />
									<p>No se encontraron archivos</p>
								</div>
							</TableBodyCell>
						</TableBodyRow>
					{/each}
				</TableBody>
			</Table>
		</div>

		<!-- Pagination -->
		{#if data.pagination.totalPages > 1}
			<div class="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Mostrando {(data.pagination.page - 1) * data.pagination.limit + 1} a{' '}
					{Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} de{' '}
					{data.pagination.total} archivos
				</p>
				<div class="flex gap-2">
					<Button
						size="xs"
						color="alternative"
						disabled={data.pagination.page === 1}
						onclick={() => handlePageChange(data.pagination.page - 1)}
					>
						Anterior
					</Button>
					<Button
						size="xs"
						color="alternative"
						disabled={data.pagination.page === data.pagination.totalPages}
						onclick={() => handlePageChange(data.pagination.page + 1)}
					>
						Siguiente
					</Button>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Maintenance Modal -->
<Modal bind:open={isMaintenanceModalOpen} title="Mantenimiento de Archivos" size="md">
	<div class="space-y-4">
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Ejecuta tareas de mantenimiento para limpiar archivos eliminados y detectar huérfanos.
		</p>

		<div class="grid gap-3">
			<Button
				color="alternative"
				class="justify-start"
				onclick={() => runMaintenance('detect-orphans')}
				disabled={maintenanceLoading}
			>
				<Search class="mr-2 h-4 w-4" />
				Detectar Huérfanos
			</Button>
			<Button
				color="alternative"
				class="justify-start"
				onclick={() => runMaintenance('purge-deleted')}
				disabled={maintenanceLoading}
			>
				<Trash2 class="mr-2 h-4 w-4" />
				Purgar Eliminados (+7 días)
			</Button>
			<Button
				color="alternative"
				class="justify-start"
				onclick={() => runMaintenance('purge-orphans')}
				disabled={maintenanceLoading}
			>
				<AlertTriangle class="mr-2 h-4 w-4" />
				Purgar Huérfanos (+30 días)
			</Button>
			<Button
				color="primary"
				class="justify-start"
				onclick={() => runMaintenance('full-cleanup')}
				disabled={maintenanceLoading}
			>
				<Wrench class="mr-2 h-4 w-4" />
				Limpieza Completa
			</Button>
		</div>

		{#if maintenanceLoading}
			<div class="flex items-center justify-center py-4">
				<Spinner size="8" />
			</div>
		{/if}

		{#if maintenanceResult}
			<Alert color={maintenanceResult.success ? 'green' : 'red'}>
				{#snippet icon()}
					{#if maintenanceResult.success}
						<Check class="h-5 w-5" />
					{:else}
						<X class="h-5 w-5" />
					{/if}
				{/snippet}
				{#if maintenanceResult.success}
					<div class="text-sm">
						{#if maintenanceResult.result?.orphansDetected !== undefined}
							<p>Huérfanos detectados: {maintenanceResult.result.orphansDetected}</p>
						{/if}
						{#if maintenanceResult.result?.purgedCount !== undefined}
							<p>Archivos purgados: {maintenanceResult.result.purgedCount}</p>
						{/if}
						{#if maintenanceResult.result?.freedBytes !== undefined}
							<p>Espacio liberado: {formatBytes(maintenanceResult.result.freedBytes)}</p>
						{/if}
						{#if maintenanceResult.result?.deletedPurged !== undefined}
							<p>Eliminados purgados: {maintenanceResult.result.deletedPurged}</p>
							<p>Huérfanos purgados: {maintenanceResult.result.orphansPurged}</p>
						{/if}
					</div>
				{:else}
					<p>{maintenanceResult.error}</p>
				{/if}
			</Alert>
		{/if}
	</div>
</Modal>

<!-- Processing Modal -->
<Modal bind:open={isProcessingModalOpen} title="Procesamiento de Imágenes" size="md">
	<div class="space-y-4">
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Gestiona el procesamiento de imágenes (thumbnails y optimización).
		</p>

		<div class="grid gap-3">
			<Button
				color="alternative"
				class="justify-start"
				onclick={() => runProcessing('process-batch')}
				disabled={processingLoading}
			>
				<Play class="mr-2 h-4 w-4" />
				Procesar Lote (5 archivos)
			</Button>
			<Button
				color="alternative"
				class="justify-start"
				onclick={() => runProcessing('requeue-error')}
				disabled={processingLoading}
			>
				<RotateCcw class="mr-2 h-4 w-4" />
				Reencolar Fallidos
			</Button>
		</div>

		{#if processingLoading}
			<div class="flex items-center justify-center py-4">
				<Spinner size="8" />
			</div>
		{/if}

		{#if processingResult}
			<Alert color={processingResult.success ? 'green' : 'red'}>
				{#snippet icon()}
					{#if processingResult.success}
						<Check class="h-5 w-5" />
					{:else}
						<X class="h-5 w-5" />
					{/if}
				{/snippet}
				{#if processingResult.success}
					<div class="text-sm">
						{#if processingResult.result?.processed !== undefined}
							<p>Procesados: {processingResult.result.processed}</p>
							<p>Exitosos: {processingResult.result.succeeded}</p>
							<p>Fallidos: {processingResult.result.error}</p>
						{/if}
						{#if processingResult.requeuedCount !== undefined}
							<p>Reencolados: {processingResult.requeuedCount}</p>
						{/if}
					</div>
				{:else}
					<p>{processingResult.error}</p>
				{/if}
			</Alert>
		{/if}
	</div>
</Modal>
