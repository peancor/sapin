<script lang="ts">
	import type { PageData } from './$types';
	import { Button, Badge, Input } from 'flowbite-svelte';
	import { BookOpen, Search, X, ExternalLink, Eye } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Search state
	let searchTerm = $state('');

	// Filtered activities
	let filteredActivities = $derived.by(() => {
		if (!searchTerm) return data.interactives;
		const term = searchTerm.toLowerCase();
		return data.interactives.filter(
			(i) =>
				i.name?.toLowerCase().includes(term) ||
				i.description?.toLowerCase().includes(term) ||
				i.type?.toLowerCase().includes(term)
		);
	});

	// Get activity type color
	function getTypeColor(type: string): 'blue' | 'purple' | 'green' | 'gray' {
		switch (type) {
			case 'chat':
				return 'blue';
			case 'quiz':
				return 'purple';
			case 'simulation':
				return 'green';
			default:
				return 'gray';
		}
	}

	// Get activity status color
	function getStatusColor(status: string): 'green' | 'yellow' | 'orange' | 'gray' {
		switch (status) {
			case 'published':
				return 'green';
			case 'hidden':
				return 'yellow';
			case 'closed':
				return 'orange';
			case 'archived':
				return 'gray';
			default:
				return 'gray';
		}
	}

	// Get status label
	function getStatusLabel(status: string): string {
		switch (status) {
			case 'published':
				return 'Publicada';
			case 'hidden':
				return 'Oculta';
			case 'closed':
				return 'Cerrada';
			case 'archived':
				return 'Archivada';
			default:
				return status;
		}
	}

	// Get type label
	function getTypeLabel(type: string): string {
		switch (type) {
			case 'chat':
				return 'Chat';
			case 'quiz':
				return 'Quiz';
			case 'simulation':
				return 'Simulación';
			default:
				return type;
		}
	}
</script>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Actividades del Curso</h1>
			<p class="mt-1 text-gray-500 dark:text-gray-400">
				{data.interactives.length} actividades en este curso
			</p>
		</div>
		<Button href="/course/{data.courseId}/admin/interactives" color="primary">
			<ExternalLink class="mr-2 h-4 w-4" />
			Gestionar en Panel del Curso
		</Button>
	</div>

	<!-- Search -->
	<div class="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
		<div class="relative max-w-md">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<Search class="h-4 w-4 text-gray-400" />
			</div>
			<Input
				type="text"
				placeholder="Buscar por nombre, descripción o tipo..."
				bind:value={searchTerm}
				class="pl-10"
			/>
			{#if searchTerm}
				<button
					onclick={() => (searchTerm = '')}
					class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Info Banner -->
	<div class="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
		<p class="text-sm text-blue-700 dark:text-blue-300">
			Esta es una vista de solo lectura. Para gestionar actividades (crear, editar, eliminar),
			usa el <a href="/course/{data.courseId}/admin/interactives" class="font-medium underline">Panel de Administración del Curso</a>.
		</p>
	</div>

	<!-- Activities Grid -->
	{#if filteredActivities.length > 0}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredActivities as activity (activity.id)}
				<div
					class="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800"
				>
					<div class="mb-3 flex items-start justify-between">
						<h3 class="font-semibold text-gray-900 dark:text-white line-clamp-2">
							{activity.name}
						</h3>
						<Badge color={getStatusColor(activity.status)} class="shrink-0 ml-2">
							{getStatusLabel(activity.status)}
						</Badge>
					</div>

					<p class="mb-4 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
						{activity.description || 'Sin descripción'}
					</p>

					<div class="flex items-center justify-between">
						<Badge color={getTypeColor(activity.type)} class="capitalize">
							{getTypeLabel(activity.type)}
						</Badge>

						<div class="flex gap-2">
							<Button
								href="/interactive-chat/{activity.id}"
								size="xs"
								color="light"
								class="!p-2"
							>
								<Eye class="h-4 w-4" />
							</Button>
							<Button
								href="/course/{data.courseId}/admin/interactives/{activity.id}"
								size="xs"
								color="alternative"
							>
								Ver detalles
							</Button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
			<BookOpen class="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
			{#if searchTerm}
				<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">Sin resultados</h3>
				<p class="text-gray-500 dark:text-gray-400">
					No se encontraron actividades que coincidan con "{searchTerm}"
				</p>
				<Button color="light" size="sm" class="mt-4" onclick={() => (searchTerm = '')}>
					Limpiar búsqueda
				</Button>
			{:else}
				<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">
					Sin actividades
				</h3>
				<p class="mb-4 text-gray-500 dark:text-gray-400">
					Este curso aún no tiene actividades de aprendizaje
				</p>
				<Button href="/course/{data.courseId}/admin/interactives/new" color="primary">
					Crear primera actividad
				</Button>
			{/if}
		</div>
	{/if}

	<!-- Stats Summary -->
	{#if data.interactives.length > 0}
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<h3 class="mb-4 font-semibold text-gray-900 dark:text-white">Resumen</h3>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">{data.interactives.length}</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">Total</p>
				</div>
				<div>
					<p class="text-2xl font-bold text-green-600 dark:text-green-400">
						{data.interactives.filter((i) => i.status === 'published').length}
					</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">Publicadas</p>
				</div>
				<div>
					<p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
						{data.interactives.filter((i) => i.status === 'hidden').length}
					</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">Ocultas</p>
				</div>
				<div>
					<p class="text-2xl font-bold text-gray-600 dark:text-gray-400">
						{data.interactives.filter((i) => i.status === 'archived' || i.status === 'closed').length}
					</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">Archivadas/Cerradas</p>
				</div>
			</div>
		</div>
	{/if}
</div>
