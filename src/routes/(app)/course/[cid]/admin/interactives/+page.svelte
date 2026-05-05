<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Modal, Toast, Input, Badge, Dropdown, DropdownItem } from 'flowbite-svelte';
	import {
		getStoredCourseAdminInteractiveViewMode,
		setStoredCourseAdminInteractiveViewMode,
		getFilenameFromContentDisposition,
		saveBlobAs,
		type CourseAdminInteractiveViewMode
	} from '$lib/utils';
	import {
		Plus,
		Search,
		MoreVertical,
		Eye,
		Link,
		Trash2,
		Users,
		MessageSquare,
		LayoutGrid,
		List,
		BookOpen,
		Download,
		Upload,
		Bot,
		Route
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Estado de la vista
	let viewMode = $state<CourseAdminInteractiveViewMode>('cards');
	let searchQuery = $state('');

	// Filtrar actividades
	let filteredInteractives = $derived(
		data.interactives.filter(
			(i) =>
				i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				(i.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
		)
	);

	// Modal de eliminación
	let deleteModal = $state(false);
	let interactiveToDelete = $state<(typeof data.interactives)[number] | null>(null);

	// Modal de importación
	let importModal = $state(false);
	let importFile = $state<File | null>(null);
	let importing = $state(false);
	let importResult = $state<{
		activityId: string;
		activityType: string;
		message: string;
		resourceCount: number;
		revisionCount: number;
	} | null>(null);

	// Toast
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');

	onMount(() => {
		viewMode = getStoredCourseAdminInteractiveViewMode() ?? 'cards';
	});

	function showNotification(message: string, type: 'success' | 'error') {
		toastMessage = message;
		toastType = type;
		showToast = true;
		setTimeout(() => (showToast = false), 4000);
	}

	function confirmDelete(interactive: (typeof data.interactives)[number]) {
		interactiveToDelete = interactive;
		deleteModal = true;
	}

	function getStudentRunUrl(interactive: { id: string; type: string }): string {
		if (interactive.type === 'agent') return `/student/run-agent/${interactive.id}`;
		if (interactive.type === 'lesson') return `/student/run-lesson/${interactive.id}`;
		return `/student/run-chat/${interactive.id}`;
	}

	async function copyActivityLink(interactive: { id: string; type: string }) {
		try {
			const link = `${window.location.origin}${getStudentRunUrl(interactive)}`;
			await navigator.clipboard.writeText(link);
			showNotification(
				'Enlace copiado. Añade ?externalid=ID_ALUMNO para identificar estudiantes',
				'success'
			);
		} catch {
			showNotification('Error al copiar el enlace', 'error');
		}
	}

	function getTypeColor(type: string): 'blue' | 'purple' | 'green' | 'gray' {
		switch (type) {
			case 'chat':
				return 'blue';
			case 'agent':
				return 'green';
			case 'lesson':
				return 'purple';
			case 'quiz':
				return 'purple';
			case 'simulation':
				return 'green';
			default:
				return 'gray';
		}
	}

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

	function setViewMode(nextMode: CourseAdminInteractiveViewMode) {
		if (viewMode === nextMode) return;

		viewMode = nextMode;
		setStoredCourseAdminInteractiveViewMode(nextMode);
	}

	async function exportActivity(id: string, name: string) {
		try {
			const response = await fetch(`/api/interactive/export/${id}`);
			if (!response.ok) throw new Error('Error al exportar');

			const blob = await response.blob();
			const filename = getFilenameFromContentDisposition(
				response.headers.get('Content-Disposition'),
				`activity-${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${Date.now()}.json`
			);
			const saveResult = await saveBlobAs(blob, filename);
			if (saveResult === 'cancelled') {
				showNotification('Exportación cancelada', 'success');
				return;
			}

			showNotification(
				saveResult === 'saved'
					? 'Actividad guardada correctamente'
					: 'Actividad exportada correctamente',
				'success'
			);
		} catch {
			showNotification('Error al exportar la actividad', 'error');
		}
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			importFile = input.files[0];
			importResult = null;
		}
	}

	async function importActivity() {
		if (!importFile) {
			showNotification('Selecciona un archivo para importar', 'error');
			return;
		}

		importing = true;
		try {
			const formData = new FormData();
			formData.append('courseId', data.courseId);
			formData.append('file', importFile);

			const response = await fetch('/api/interactive/import', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Error al importar');
			}

			importFile = null;
			const result = await response.json();
			importResult = {
				activityId: result.activityId,
				activityType: result.activityType ?? 'chat',
				message: result.message ?? 'Actividad importada correctamente',
				resourceCount: result.resourceCount ?? 0,
				revisionCount: result.revisionCount ?? 0
			};
			showNotification(importResult.message, 'success');
			await invalidateAll();
		} catch (e) {
			showNotification(e instanceof Error ? e.message : 'Error al importar la actividad', 'error');
		} finally {
			importing = false;
		}
	}

	type ImportResultHref =
		| `/course/${string}/admin/interactives`
		| `/course/${string}/admin/interactives/${string}`
		| `/course/${string}/lesson-studio/${string}`;

	function getImportResultHref(): ImportResultHref {
		if (!importResult) return `/course/${data.courseId}/admin/interactives`;
		if (importResult.activityType === 'lesson') {
			return `/course/${data.courseId}/lesson-studio/${importResult.activityId}`;
		}
		return `/course/${data.courseId}/admin/interactives/${importResult.activityId}`;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Actividades</h1>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Gestiona las actividades de aprendizaje interactivo del curso
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Button color="alternative" onclick={() => (importModal = true)}>
				<Upload class="mr-2 h-4 w-4" />
				Importar
			</Button>
			<a
				href={resolve(`/course/${data.courseId}/admin/interactives/new`)}
				class="bg-primary-600 hover:bg-primary-700 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors"
			>
				<Plus class="h-4 w-4" />
				Nueva actividad
			</a>
		</div>
	</div>

	<!-- Toolbar -->
	<div
		class="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:bg-gray-800"
	>
		<!-- Search -->
		<div class="relative flex-1 sm:max-w-xs">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
			<Input
				type="text"
				placeholder="Buscar actividades..."
				bind:value={searchQuery}
				class="pl-10"
			/>
		</div>

		<!-- View Toggle & Stats -->
		<div class="flex items-center gap-4">
			<span class="text-sm text-gray-500 dark:text-gray-400">
				{filteredInteractives.length} actividad{filteredInteractives.length !== 1 ? 'es' : ''}
			</span>
			<div class="flex rounded-lg border border-gray-200 dark:border-gray-600">
				<button
					type="button"
					class="rounded-l-lg p-2 transition-colors {viewMode === 'cards'
						? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400'
						: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}"
					aria-pressed={viewMode === 'cards'}
					title="Vista en tarjetas"
					onclick={() => setViewMode('cards')}
				>
					<LayoutGrid class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="rounded-r-lg p-2 transition-colors {viewMode === 'table'
						? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400'
						: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}"
					aria-pressed={viewMode === 'table'}
					title="Vista en lista"
					onclick={() => setViewMode('table')}
				>
					<List class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>

	<!-- Content -->
	{#if filteredInteractives.length === 0}
		<div class="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
			<div
				class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
			>
				<BookOpen class="h-8 w-8 text-gray-400" />
			</div>
			{#if searchQuery}
				<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">Sin resultados</h3>
				<p class="text-gray-500 dark:text-gray-400">
					No se encontraron actividades para "{searchQuery}"
				</p>
			{:else}
				<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">No hay actividades</h3>
				<p class="mb-4 text-gray-500 dark:text-gray-400">
					Crea tu primera actividad de aprendizaje interactivo
				</p>
				<a
					href={resolve(`/course/${data.courseId}/admin/interactives/new`)}
					class="bg-primary-600 hover:bg-primary-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
				>
					<Plus class="h-4 w-4" />
					Nueva actividad
				</a>
			{/if}
		</div>
	{:else if viewMode === 'cards'}
		<!-- Cards View -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredInteractives as interactive (interactive.id)}
				<div
					class="group relative overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800"
				>
					<!-- Card Header -->
					<div class="border-b border-gray-100 p-4 dark:border-gray-700">
						<div class="flex items-start justify-between">
							<div class="flex items-center gap-3">
								<div
									class="flex h-10 w-10 items-center justify-center rounded-lg {interactive.type ===
									'agent'
										? 'bg-green-100 dark:bg-green-900/50'
										: interactive.type === 'lesson'
											? 'bg-amber-100 dark:bg-amber-900/30'
											: 'bg-blue-100 dark:bg-blue-900/50'}"
								>
									{#if interactive.type === 'agent'}
										<Bot class="h-5 w-5 text-green-600 dark:text-green-400" />
									{:else if interactive.type === 'lesson'}
										<Route class="h-5 w-5 text-amber-600 dark:text-amber-400" />
									{:else}
										<MessageSquare class="h-5 w-5 text-blue-600 dark:text-blue-400" />
									{/if}
								</div>
								<div>
									<h3 class="line-clamp-1 font-semibold text-gray-900 dark:text-white">
										{interactive.name}
									</h3>
									<div class="mt-1 flex gap-1">
										<Badge color={getTypeColor(interactive.type)}>{interactive.type}</Badge>
										<Badge color={getStatusColor(interactive.status)}
											>{getStatusLabel(interactive.status)}</Badge
										>
									</div>
								</div>
							</div>
							<Button
								color="light"
								class="p-2! opacity-0 transition-opacity group-hover:opacity-100"
								id="dropdown-btn-{interactive.id}"
							>
								<MoreVertical class="h-4 w-4" />
							</Button>
							<Dropdown triggeredBy="#dropdown-btn-{interactive.id}" simple>
								<DropdownItem
									href={resolve(
										interactive.type === 'agent'
											? `/agent-chat/${interactive.id}`
											: interactive.type === 'lesson'
												? `/lesson/${interactive.id}`
												: `/interactive-chat/${interactive.id}`
									)}
								>
									<Eye class="mr-2 inline h-4 w-4" /> Previsualizar
								</DropdownItem>
								<DropdownItem
									href={resolve(
										`/course/${data.courseId}/admin/interactives/${interactive.id}/students`
									)}
								>
									<Users class="mr-2 inline h-4 w-4" /> Ver estudiantes
								</DropdownItem>
								<DropdownItem onclick={() => copyActivityLink(interactive)}>
									<Link class="mr-2 inline h-4 w-4" /> Copiar enlace
								</DropdownItem>
								<DropdownItem onclick={() => exportActivity(interactive.id, interactive.name)}>
									<Download class="mr-2 inline h-4 w-4" /> Exportar
								</DropdownItem>
								<DropdownItem
									class="text-red-600 dark:text-red-400"
									onclick={() => confirmDelete(interactive)}
								>
									<Trash2 class="mr-2 inline h-4 w-4" /> Eliminar
								</DropdownItem>
							</Dropdown>
						</div>
					</div>

					<!-- Card Body -->
					<div class="p-4">
						<p class="mb-4 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
							{interactive.description || 'Sin descripción'}
						</p>
						<div class="flex items-center gap-4 text-sm">
							<div class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
								<Users class="h-4 w-4" />
								<span>{interactive.participations ?? 0} participaciones</span>
							</div>
						</div>
					</div>

					<!-- Card Footer -->
					<div
						class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50"
					>
						<span class="text-xs text-gray-500 dark:text-gray-400"
							>Orden: {interactive.order ?? '-'}</span
						>
						<a
							href={resolve(`/course/${data.courseId}/admin/interactives/${interactive.id}`)}
							class="text-primary-600 hover:text-primary-700 dark:text-primary-400 text-sm font-medium"
						>
							Ver detalles →
						</a>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Table View -->
		<div class="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
			<table class="w-full">
				<thead>
					<tr class="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
						<th class="px-6 py-4 text-left text-sm font-medium text-gray-500 dark:text-gray-400"
							>Actividad</th
						>
						<th class="px-6 py-4 text-left text-sm font-medium text-gray-500 dark:text-gray-400"
							>Tipo</th
						>
						<th class="px-6 py-4 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
							>Participaciones</th
						>
						<th class="px-6 py-4 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
							>Orden</th
						>
						<th class="px-6 py-4 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
							>Acciones</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
					{#each filteredInteractives as interactive (interactive.id)}
						<tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
							<td class="px-6 py-4">
								<a
									href={resolve(`/course/${data.courseId}/admin/interactives/${interactive.id}`)}
									class="hover:text-primary-600 dark:hover:text-primary-400 font-medium text-gray-900 dark:text-white"
								>
									{interactive.name}
								</a>
								<p class="mt-1 line-clamp-1 text-sm text-gray-500 dark:text-gray-400">
									{interactive.description || 'Sin descripción'}
								</p>
							</td>
							<td class="px-6 py-4">
								<div class="flex gap-1">
									<Badge color={getTypeColor(interactive.type)}>{interactive.type}</Badge>
									<Badge color={getStatusColor(interactive.status)}
										>{getStatusLabel(interactive.status)}</Badge
									>
								</div>
							</td>
							<td class="px-6 py-4 text-center">
								<div
									class="flex items-center justify-center gap-1.5 text-gray-600 dark:text-gray-300"
								>
									<Users class="h-4 w-4" />
									{interactive.participations ?? 0}
								</div>
							</td>
							<td class="px-6 py-4 text-center text-gray-600 dark:text-gray-300"
								>{interactive.order ?? '-'}</td
							>
							<td class="px-6 py-4">
								<div class="flex items-center justify-center gap-1">
									<a
										href={resolve(
											interactive.type === 'agent'
												? `/agent-chat/${interactive.id}`
												: interactive.type === 'lesson'
													? `/lesson/${interactive.id}`
													: `/interactive-chat/${interactive.id}`
										)}
										class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-600"
										title="Previsualizar"
									>
										<Eye class="h-4 w-4" />
									</a>
									<button
										type="button"
										onclick={() => copyActivityLink(interactive)}
										class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-600"
										title="Copiar enlace"
									>
										<Link class="h-4 w-4" />
									</button>
									<button
										type="button"
										onclick={() => exportActivity(interactive.id, interactive.name)}
										class="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-600"
										title="Exportar"
									>
										<Download class="h-4 w-4" />
									</button>
									<button
										type="button"
										onclick={() => confirmDelete(interactive)}
										class="rounded p-2 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
										title="Eliminar"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Delete Modal -->
<Modal bind:open={deleteModal} size="sm">
	<div class="text-center">
		<div
			class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
		>
			<Trash2 class="h-6 w-6 text-red-600 dark:text-red-400" />
		</div>
		<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">Eliminar actividad</h3>
		<p class="mb-2 text-gray-500 dark:text-gray-400">
			¿Estás seguro de que deseas eliminar esta actividad?
		</p>
		<p class="mb-6 font-semibold text-gray-900 dark:text-white">{interactiveToDelete?.name}</p>
		<form
			method="POST"
			action="?/deleteInteractive"
			use:enhance={() => {
				return async ({ result }) => {
					deleteModal = false;
					if (result.type === 'success') {
						showNotification('Actividad eliminada correctamente', 'success');
						await invalidateAll();
					} else {
						showNotification('Error al eliminar la actividad', 'error');
					}
				};
			}}
			class="flex justify-center gap-3"
		>
			<input type="hidden" name="id" value={interactiveToDelete?.id} />
			<Button color="alternative" onclick={() => (deleteModal = false)}>Cancelar</Button>
			<Button type="submit" color="red">Eliminar</Button>
		</form>
	</div>
</Modal>

<!-- Import Modal -->
<Modal bind:open={importModal} size="md">
	<div class="space-y-4">
		<div class="text-center">
			<div
				class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30"
			>
				<Upload class="h-6 w-6 text-blue-600 dark:text-blue-400" />
			</div>
			<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">Importar actividad</h3>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Selecciona un JSON de actividad o un paquete .sapinlesson.zip
			</p>
		</div>

		<div class="mt-4">
			<label
				class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
			>
				<Upload class="mb-2 h-8 w-8 text-gray-400" />
				<span class="text-sm text-gray-500 dark:text-gray-400">
					{importFile ? importFile.name : 'Haz clic para seleccionar archivo'}
				</span>
				<input
					type="file"
					accept=".json,.zip,.sapinlesson.zip,application/zip"
					class="hidden"
					onchange={handleFileSelect}
				/>
			</label>
		</div>

		{#if importFile}
			<div class="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
				<p class="text-sm text-blue-700 dark:text-blue-300">
					<strong>Archivo seleccionado:</strong>
					{importFile.name}
				</p>
			</div>
		{/if}

		{#if importResult}
			<div class="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
				<p class="text-sm font-semibold text-green-800 dark:text-green-200">
					{importResult.message}
				</p>
				{#if importResult.activityType === 'lesson'}
					<p class="mt-1 text-sm text-green-700 dark:text-green-300">
						{importResult.resourceCount} recurso{importResult.resourceCount === 1 ? '' : 's'} y
						{importResult.revisionCount} revisi{importResult.revisionCount === 1 ? 'ón' : 'ones'}
						importad{importResult.revisionCount === 1 ? 'a' : 'as'}.
					</p>
				{/if}
				<button
					type="button"
					onclick={() => goto(resolve(getImportResultHref()))}
					class="text-primary-700 dark:text-primary-300 mt-3 inline-flex text-sm font-semibold hover:underline"
				>
					Abrir actividad importada
				</button>
			</div>
		{/if}

		<div class="flex justify-end gap-3 pt-4">
			<Button
				color="alternative"
				onclick={() => {
					importModal = false;
					importFile = null;
					importResult = null;
				}}
			>
				Cancelar
			</Button>
			<Button color="primary" onclick={importActivity} disabled={!importFile || importing}>
				{#if importing}
					Importando...
				{:else}
					Importar
				{/if}
			</Button>
		</div>
	</div>
</Modal>

<!-- Toast -->
{#if showToast}
	<div class="fixed right-4 bottom-4 z-50">
		<Toast color={toastType === 'success' ? 'green' : 'red'}>
			{#snippet icon()}
				{#if toastType === 'success'}
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						></path>
					</svg>
				{:else}
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clip-rule="evenodd"
						></path>
					</svg>
				{/if}
			{/snippet}
			{toastMessage}
		</Toast>
	</div>
{/if}
