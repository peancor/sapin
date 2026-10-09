<script lang="ts">
	import '$lib/styles/admin-collections.css';
	import { Card, Modal, Button, Badge, Avatar, Tooltip, Spinner } from 'flowbite-svelte';
	import {
		PlusOutline,
		PenSolid,
		TrashBinSolid,
		UsersSolid,
		ExclamationCircleOutline,
		BookOpenSolid,
		SearchOutline,
		ClipboardListSolid
	} from 'flowbite-svelte-icons';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();

	// Search & filter
	let searchTerm = $state('');

	// Modal states
	let showDeleteModal = $state(false);
	let courseToDelete = $state<{ id: string; name: string } | null>(null);
	let isLoading = $state(false);
	let showRebuildModal = $state(false);
	let courseToRebuild = $state<{ id: string; name: string } | null>(null);
	let rebuildMode = $state<'fill_missing' | 'rebuild_all'>('fill_missing');
	let isRebuilding = $state(false);
	let rebuildResult = $state<{ success: boolean; message: string } | null>(null);

	// Filtered courses
	let filteredCourses = $derived.by(() => {
		if (!searchTerm) return data.courses;
		const term = searchTerm.toLowerCase();
		return data.courses.filter(
			(course) =>
				course.name.toLowerCase().includes(term) || course.description?.toLowerCase().includes(term)
		);
	});

	// Course teachers helper
	function getCourseTeachers(course: (typeof data.courses)[0]) {
		return (course.courseRoles || []).filter((r) => ['owner', 'admin', 'teacher'].includes(r.role));
	}

	// Course students count
	function getCourseStudentsCount(course: (typeof data.courses)[0]) {
		return (course.courseRoles || []).filter((r) => r.role === 'student').length;
	}

	// Truncate text helper
	function truncateText(text: string | null, maxLength: number) {
		if (!text) return '';
		return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
	}

	function formatRebuildDate(dateIso: string): string {
		return new Date(dateIso).toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getRebuildModeLabel(mode: string): string {
		return mode === 'rebuild_all' ? 'Completa' : 'Solo faltantes';
	}

	// Delete course
	async function deleteCourse() {
		if (!courseToDelete) return;

		isLoading = true;
		try {
			const response = await fetch(`/api/courses?id=${courseToDelete.id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				showDeleteModal = false;
				courseToDelete = null;
				await invalidateAll();
			}
		} finally {
			isLoading = false;
		}
	}

	// Open delete confirmation
	function confirmDelete(course: (typeof data.courses)[0]) {
		courseToDelete = { id: course.id, name: course.name };
		showDeleteModal = true;
	}

	function confirmRebuildProgress(course: (typeof data.courses)[0]) {
		courseToRebuild = { id: course.id, name: course.name };
		rebuildMode = 'fill_missing';
		rebuildResult = null;
		showRebuildModal = true;
	}

	async function rebuildCourseProgress() {
		if (!courseToRebuild) return;

		isRebuilding = true;
		rebuildResult = null;

		try {
			const response = await fetch(`/api/admin/courses/${courseToRebuild.id}/progress/rebuild`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode: rebuildMode })
			});

			const payload = await response.json();

			if (!response.ok || !payload.success) {
				rebuildResult = {
					success: false,
					message: payload.error || 'No se pudo regenerar el progreso'
				};
				return;
			}

			const result = payload.result;
			rebuildResult = {
				success: true,
				message:
					`Progreso regenerado. Actividades creadas: ${result.createdProgressRows}, ` +
					`resúmenes creados: ${result.createdSummaryRows}, resúmenes actualizados: ${result.updatedSummaryRows}.`
			};

			await invalidateAll();
		} catch {
			rebuildResult = {
				success: false,
				message: 'Error de red al regenerar progreso'
			};
		} finally {
			isRebuilding = false;
		}
	}

	// Get role badge color
	function getRoleBadgeColor(role: string): 'purple' | 'red' | 'blue' | 'gray' {
		switch (role) {
			case 'owner':
				return 'purple';
			case 'admin':
				return 'red';
			case 'teacher':
				return 'blue';
			default:
				return 'gray';
		}
	}

	// Get status badge color
	function getStatusBadgeColor(status: string): 'green' | 'yellow' | 'gray' {
		switch (status) {
			case 'published':
				return 'green';
			case 'draft':
				return 'yellow';
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
				return 'Publicado';
			case 'draft':
				return 'Borrador';
			case 'archived':
				return 'Archivado';
			default:
				return status;
		}
	}

	// Stats
	let totalStudents = $derived(
		data.courses.reduce((acc, course) => acc + getCourseStudentsCount(course), 0)
	);
	let totalTeachers = $derived(
		new Set(data.courses.flatMap((c) => getCourseTeachers(c).map((t) => t.userId))).size
	);
</script>

<div class="admin-collection space-y-6">
	<div class="collection-header">
		<div>
			<h1 class="collection-title">Gestión de cursos</h1>
			<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
				Administra y organiza los cursos de tu plataforma educativa
			</p>
		</div>
		<Button color="primary" class="collection-primary" href={resolve('/admin/courses/new')}>
			<PlusOutline class="me-2 h-4 w-4" />
			Crear curso
		</Button>
	</div>

	<dl class="collection-stats">
		<div>
			<dt>Total cursos</dt>
			<dd>{data.courses.length}</dd>
		</div>
		<div>
			<dt>Total estudiantes</dt>
			<dd>{totalStudents}</dd>
		</div>
		<div>
			<dt>Profesores activos</dt>
			<dd>{totalTeachers}</dd>
		</div>
	</dl>

	<div class="collection-toolbar">
		<div class="relative w-full sm:max-w-md">
			<SearchOutline
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
			/>
			<input
				type="search"
				aria-label="Buscar cursos"
				bind:value={searchTerm}
				placeholder="Buscar cursos por nombre o descripción..."
				class="collection-search w-full py-2.5 ps-10 pe-3"
			/>
		</div>
		<p class="text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
			{#if searchTerm}
				Mostrando {filteredCourses.length} de {data.courses.length} cursos
			{:else}
				{data.courses.length} cursos en total
			{/if}
		</p>
	</div>

	{#if filteredCourses.length > 0}
		<div class="collection-grid">
			{#each filteredCourses as course (course.id)}
				{@const teachers = getCourseTeachers(course)}
				{@const studentCount = getCourseStudentsCount(course)}
				<article class="collection-card p-5">
					<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
						<Badge color={getStatusBadgeColor(course.status)} class="text-xs">
							{getStatusLabel(course.status)}
						</Badge>
						<div class="flex items-center gap-1">
							<Button
								size="xs"
								color="light"
								class="collection-secondary-action h-9 w-9 p-0!"
								aria-label={`Regenerar progreso de ${course.name}`}
								onclick={() => confirmRebuildProgress(course)}
							>
								<ClipboardListSolid class="h-4 w-4" />
							</Button>
							<Tooltip>Regenerar progreso</Tooltip>
							<Button
								size="xs"
								color="light"
								class="collection-secondary-action h-9 w-9 p-0!"
								aria-label={`Gestionar ${course.name}`}
								href={resolve(`/admin/courses/${course.id}`)}
							>
								<PenSolid class="h-4 w-4" />
							</Button>
							<Tooltip>Gestionar curso</Tooltip>
							<Button
								size="xs"
								color="light"
								class="collection-secondary-action h-9 w-9 p-0! hover:text-red-700! dark:hover:text-red-400!"
								aria-label={`Eliminar ${course.name}`}
								onclick={() => confirmDelete(course)}
							>
								<TrashBinSolid class="h-4 w-4" />
							</Button>
							<Tooltip>Eliminar curso</Tooltip>
						</div>
					</div>
					<h2>
						<a class="collection-card-title" href={resolve(`/admin/courses/${course.id}`)}
							>{course.name}</a
						>
					</h2>
					<p class="mt-2 mb-5 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
						{course.description
							? truncateText(course.description, 120)
							: 'Sin descripción disponible'}
					</p>
					{#if course.lastProgressRebuild}
						<div
							class="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-900/40 dark:text-gray-300"
						>
							<p class="font-medium">Última regeneración</p>
							<p>
								{formatRebuildDate(course.lastProgressRebuild.rebuildAt)} · {getRebuildModeLabel(
									course.lastProgressRebuild.mode
								)}
							</p>
						</div>
					{/if}
					<div class="mb-5">
						<p class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Profesores</p>
						{#if teachers.length > 0}
							<div class="flex flex-wrap items-center gap-3">
								<div class="flex -space-x-2">
									{#each teachers.slice(0, 3) as teacher (teacher.assignmentId)}
										<Avatar
											src={teacher.image ?? undefined}
											alt={teacher.username ?? 'Profesor'}
											size="sm"
											class="ring-2 ring-white dark:ring-gray-800"
										/>
									{/each}
									{#if teachers.length > 3}
										<div
											class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 ring-2 ring-white dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-800"
										>
											+{teachers.length - 3}
										</div>
									{/if}
								</div>
								<div class="flex min-w-0 flex-wrap gap-1">
									{#each teachers.slice(0, 2) as teacher (teacher.assignmentId)}
										<Badge
											color={getRoleBadgeColor(teacher.role)}
											class="max-w-full text-xs break-all">{teacher.username ?? 'Sin nombre'}</Badge
										>
									{/each}
									{#if teachers.length > 2}<Badge color="gray" class="text-xs"
											>+{teachers.length - 2}</Badge
										>{/if}
								</div>
							</div>
						{:else}
							<p class="text-sm text-gray-500 dark:text-gray-400">Sin profesores asignados</p>
						{/if}
					</div>
					<div class="collection-card-footer justify-between">
						<div class="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
							<span class="flex items-center gap-1.5"
								><UsersSolid class="h-4 w-4" />{studentCount} alumnos</span
							>
							<span class="flex items-center gap-1.5"
								><BookOpenSolid class="h-4 w-4" />{course.activityCount || 0} actividades</span
							>
						</div>
						<a
							class="collection-link inline-flex items-center"
							href={resolve(`/admin/courses/${course.id}`)}>Ver detalles</a
						>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<Card class="collection-card max-w-none! p-8! text-center sm:p-12!">
			<BookOpenSolid class="mx-auto mb-4 h-10 w-10 text-gray-400" />
			{#if searchTerm}
				<h2 class="mb-2 text-lg font-semibold">No se encontraron resultados</h2>
				<p class="mb-4 text-gray-600 dark:text-gray-300">
					No hay cursos que coincidan con "{searchTerm}"
				</p>
				<Button color="light" onclick={() => (searchTerm = '')}>Limpiar búsqueda</Button>
			{:else}
				<h2 class="mb-2 text-lg font-semibold">No hay cursos registrados</h2>
				<p class="mb-4 text-gray-600 dark:text-gray-300">
					Comienza creando tu primer curso para organizar tu contenido educativo
				</p>
				<Button color="primary" class="collection-primary" href={resolve('/admin/courses/new')}
					><PlusOutline class="me-2 h-4 w-4" />Crear primer curso</Button
				>
			{/if}
		</Card>
	{/if}
</div>

<!-- Delete Confirmation Modal -->
<Modal bind:open={showDeleteModal} size="sm" class="backdrop-blur-sm">
	<div class="p-2 text-center">
		<div
			class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-100 to-red-200 shadow-lg shadow-red-500/20 dark:from-red-900/30 dark:to-red-800/30"
		>
			<ExclamationCircleOutline class="h-9 w-9 text-red-500" />
		</div>
		<h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">¿Eliminar curso?</h3>
		{#if courseToDelete}
			<p class="mb-2 text-gray-500 dark:text-gray-400">Estás a punto de eliminar:</p>
			<div
				class="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
			>
				<p class="font-semibold text-gray-900 dark:text-white">
					{courseToDelete.name}
				</p>
			</div>
		{/if}
		<p class="mb-6 text-sm text-gray-400 dark:text-gray-500">
			Esta acción no se puede deshacer. Se eliminarán todas las asignaciones de profesores y
			alumnos.
		</p>
		<div class="flex flex-col justify-center gap-3 sm:flex-row">
			<Button
				color="alternative"
				onclick={() => {
					showDeleteModal = false;
					courseToDelete = null;
				}}
				class="!rounded-xl !px-6"
			>
				Cancelar
			</Button>
			<Button
				color="red"
				loading={isLoading}
				onclick={deleteCourse}
				class="!rounded-xl !px-6 shadow-lg shadow-red-500/25 transition-all hover:shadow-red-500/40"
			>
				<TrashBinSolid class="me-2 h-4 w-4" />
				Eliminar
			</Button>
		</div>
	</div>
</Modal>

<!-- Rebuild Progress Modal -->
<Modal bind:open={showRebuildModal} size="sm" class="backdrop-blur-sm">
	<div class="p-2">
		<h3 class="mb-2 text-center text-xl font-bold text-gray-900 dark:text-white">
			Regenerar progreso
		</h3>
		{#if courseToRebuild}
			<p class="mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
				Curso: <span class="font-semibold text-gray-900 dark:text-white"
					>{courseToRebuild.name}</span
				>
			</p>
		{/if}

		<div class="mb-4 space-y-2">
			<label
				class="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
			>
				<input type="radio" bind:group={rebuildMode} value="fill_missing" class="mt-1" />
				<span class="text-sm text-gray-700 dark:text-gray-300">
					<strong>Solo faltantes</strong><br />
					Crea progreso solo donde no exista registro previo.
				</span>
			</label>
			<label
				class="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
			>
				<input type="radio" bind:group={rebuildMode} value="rebuild_all" class="mt-1" />
				<span class="text-sm text-gray-700 dark:text-gray-300">
					<strong>Reconstrucción completa</strong><br />
					Borra progreso del curso y lo recalcula desde evidencias.
				</span>
			</label>
		</div>

		{#if rebuildResult}
			<p
				class="mb-4 text-sm {rebuildResult.success
					? 'text-green-600 dark:text-green-400'
					: 'text-red-600 dark:text-red-400'}"
			>
				{rebuildResult.message}
			</p>
		{/if}

		<div class="flex flex-col justify-center gap-3 sm:flex-row">
			<Button
				color="alternative"
				onclick={() => {
					showRebuildModal = false;
					courseToRebuild = null;
					rebuildResult = null;
				}}
				class="!rounded-xl !px-6"
				disabled={isRebuilding}
			>
				Cerrar
			</Button>
			<Button
				color="yellow"
				onclick={rebuildCourseProgress}
				class="!rounded-xl !px-6"
				disabled={isRebuilding}
			>
				{#if isRebuilding}
					<Spinner size="4" class="me-2" />
				{/if}
				Ejecutar
			</Button>
		</div>
	</div>
</Modal>
