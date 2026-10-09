<script lang="ts">
	import '$lib/styles/admin-collections.css';
	import { resolve } from '$app/paths';
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

<div class="admin-collection space-y-6">
	<!-- Page Header -->
	<div class="collection-header">
		<div>
			<h1 class="collection-title">Actividades del Curso</h1>
			<p class="mt-1 text-gray-500 dark:text-gray-400">
				{data.interactives.length} actividades en este curso
			</p>
		</div>
		<Button
			href={resolve(`/course/${data.courseId}/admin/interactives`)}
			color="primary"
			class="collection-primary"
		>
			<ExternalLink class="mr-2 h-4 w-4" />
			Gestionar en Panel del Curso
		</Button>
	</div>

	<!-- Search -->
	<div class="collection-toolbar">
		<div class="relative w-full max-w-md">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<Search class="h-4 w-4 text-gray-400" />
			</div>
			<Input
				type="search"
				aria-label="Buscar actividades"
				placeholder="Buscar por nombre, descripción o tipo..."
				bind:value={searchTerm}
				class="collection-search py-2.5 pr-10 pl-10"
			/>
			{#if searchTerm}
				<button
					onclick={() => (searchTerm = '')}
					type="button"
					aria-label="Limpiar búsqueda"
					class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Info Banner -->
	<div
		class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30"
	>
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Esta es una vista de solo lectura. Para gestionar actividades (crear, editar, eliminar), usa
			el <a
				href={resolve(`/course/${data.courseId}/admin/interactives`)}
				class="font-medium underline">Panel de Administración del Curso</a
			>.
		</p>
	</div>

	<!-- Activities Grid -->
	{#if filteredActivities.length > 0}
		<div class="collection-grid">
			{#each filteredActivities as activity (activity.id)}
				<div class="collection-card p-5">
					<div class="mb-3 flex flex-col items-start gap-2">
						<h3 class="collection-card-title">
							{activity.name}
						</h3>
						<Badge color={getStatusColor(activity.status)} class="shrink-0">
							{getStatusLabel(activity.status)}
						</Badge>
					</div>

					<p class="mb-4 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
						{activity.description || 'Sin descripción'}
					</p>

					<div class="collection-card-footer justify-between">
						<Badge color={getTypeColor(activity.type)} class="capitalize">
							{getTypeLabel(activity.type)}
						</Badge>

						<div class="flex gap-2">
							<Button
								href={resolve(`/interactive-chat/${activity.id}`)}
								size="xs"
								color="light"
								class="collection-secondary-action p-2!"
								aria-label={`Previsualizar ${activity.name}`}
							>
								<Eye class="h-4 w-4" />
							</Button>
							<Button
								href={resolve(`/course/${data.courseId}/admin/interactives/${activity.id}`)}
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
		<div class="collection-card items-center p-8 text-center sm:p-12">
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
				<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">Sin actividades</h3>
				<p class="mb-4 text-gray-500 dark:text-gray-400">
					Este curso aún no tiene actividades de aprendizaje
				</p>
				<Button href={resolve(`/course/${data.courseId}/admin/interactives/new`)} color="primary">
					Crear primera actividad
				</Button>
			{/if}
		</div>
	{/if}

	<!-- Stats Summary -->
	{#if data.interactives.length > 0}
		<div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
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
						{data.interactives.filter((i) => i.status === 'archived' || i.status === 'closed')
							.length}
					</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">Archivadas/Cerradas</p>
				</div>
			</div>
		</div>
	{/if}
</div>
