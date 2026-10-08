<script lang="ts">
	import { Card, Modal, Button, Badge, Avatar, Tooltip, Spinner } from 'flowbite-svelte';
	import {
		PlusOutline,
		PenSolid,
		TrashBinSolid,
		UsersSolid,
		ExclamationCircleOutline,
		BookOpenSolid,
		SearchOutline,
		GridSolid,
		ClipboardListSolid
	} from 'flowbite-svelte-icons';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

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

	// Get gradient class for card
	function getCardGradient(index: number): string {
		const gradients = [
			'from-blue-500/10 to-purple-500/10',
			'from-emerald-500/10 to-teal-500/10',
			'from-orange-500/10 to-red-500/10',
			'from-pink-500/10 to-rose-500/10',
			'from-indigo-500/10 to-blue-500/10',
			'from-amber-500/10 to-yellow-500/10'
		];
		return gradients[index % gradients.length];
	}

	// Get accent color for stats
	function getAccentColor(index: number): string {
		const colors = [
			'text-blue-500',
			'text-emerald-500',
			'text-orange-500',
			'text-pink-500',
			'text-indigo-500',
			'text-amber-500'
		];
		return colors[index % colors.length];
	}

	// Stats
	let totalStudents = $derived(
		data.courses.reduce((acc, course) => acc + getCourseStudentsCount(course), 0)
	);
	let totalTeachers = $derived(
		new Set(data.courses.flatMap((c) => getCourseTeachers(c).map((t) => t.userId))).size
	);
</script>

<div class="container mx-auto p-4 lg:p-6">
	<!-- Header with Stats -->
	<div class="mb-8">
		<div class="mb-6 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
			<div>
				<h1 class="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
					<div class="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-2">
						<BookOpenSolid class="h-7 w-7 text-white" />
					</div>
					Gestión de Cursos
				</h1>
				<p class="mt-2 text-gray-500 dark:text-gray-400">
					Administra y organiza los cursos de tu plataforma educativa
				</p>
			</div>
			<Button
				color="blue"
				class="shadow-lg shadow-blue-500/25 transition-shadow hover:shadow-blue-500/40"
				href="/admin/courses/new"
			>
				<PlusOutline class="me-2 h-5 w-5" />
				Crear Nuevo Curso
			</Button>
		</div>

		<!-- Quick Stats -->
		<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
			<Card
				class="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 !p-4 dark:border-blue-800 dark:from-blue-900/20 dark:to-blue-800/20"
			>
				<div class="flex items-center gap-3">
					<div class="rounded-xl bg-blue-500 p-3">
						<GridSolid class="h-6 w-6 text-white" />
					</div>
					<div>
						<p class="text-sm font-medium text-blue-600 dark:text-blue-400">Total Cursos</p>
						<p class="text-2xl font-bold text-blue-700 dark:text-blue-300">{data.courses.length}</p>
					</div>
				</div>
			</Card>
			<Card
				class="border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 !p-4 dark:border-emerald-800 dark:from-emerald-900/20 dark:to-emerald-800/20"
			>
				<div class="flex items-center gap-3">
					<div class="rounded-xl bg-emerald-500 p-3">
						<UsersSolid class="h-6 w-6 text-white" />
					</div>
					<div>
						<p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">
							Total Estudiantes
						</p>
						<p class="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{totalStudents}</p>
					</div>
				</div>
			</Card>
			<Card
				class="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 !p-4 dark:border-purple-800 dark:from-purple-900/20 dark:to-purple-800/20"
			>
				<div class="flex items-center gap-3">
					<div class="rounded-xl bg-purple-500 p-3">
						<ClipboardListSolid class="h-6 w-6 text-white" />
					</div>
					<div>
						<p class="text-sm font-medium text-purple-600 dark:text-purple-400">
							Profesores Activos
						</p>
						<p class="text-2xl font-bold text-purple-700 dark:text-purple-300">{totalTeachers}</p>
					</div>
				</div>
			</Card>
		</div>

		<!-- Search Bar -->
		<div class="relative">
			<div class="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-4">
				<SearchOutline class="h-5 w-5 text-gray-400" />
			</div>
			<input
				type="text"
				bind:value={searchTerm}
				placeholder="Buscar cursos por nombre o descripción..."
				class="w-full rounded-xl border border-gray-200 bg-white py-3 ps-12 pe-4 text-gray-900 placeholder-gray-400 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
			/>
		</div>
	</div>

	<!-- Course Cards Grid -->
	{#if filteredCourses.length > 0}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
			{#each filteredCourses as course, index (course.id)}
				{@const teachers = getCourseTeachers(course)}
				{@const studentCount = getCourseStudentsCount(course)}

				<Card
					class="group overflow-hidden border border-gray-200 !p-0 transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 dark:border-gray-700 dark:hover:shadow-gray-900/50"
				>
					<!-- Card Header with Gradient -->
					<div class="relative h-32 bg-gradient-to-br {getCardGradient(index)} p-5">
						<div
							class="absolute inset-0 bg-gradient-to-t from-white/80 to-transparent dark:from-gray-800/80"
						></div>
						<div class="relative z-10">
							<div class="mb-1 flex items-start justify-between gap-2">
								<Badge color={getStatusBadgeColor(course.status)} class="text-xs">
									{getStatusLabel(course.status)}
								</Badge>
							</div>
							<h3
								class="line-clamp-2 text-xl font-bold text-gray-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400"
							>
								{course.name}
							</h3>
						</div>

						<!-- Quick Actions (Top Right) -->
						<div
							class="absolute top-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<Button
								size="xs"
								color="yellow"
								class="!p-2 shadow-lg"
								onclick={() => confirmRebuildProgress(course)}
							>
								<ClipboardListSolid class="h-3.5 w-3.5" />
							</Button>
							<Tooltip>Regenerar progreso</Tooltip>
							<Button
								size="xs"
								color="light"
								class="!p-2 shadow-lg"
								href="/admin/courses/{course.id}"
							>
								<PenSolid class="h-3.5 w-3.5" />
							</Button>
							<Tooltip>Gestionar curso</Tooltip>
							<Button
								size="xs"
								color="red"
								class="!p-2 shadow-lg"
								onclick={() => confirmDelete(course)}
							>
								<TrashBinSolid class="h-3.5 w-3.5" />
							</Button>
							<Tooltip>Eliminar curso</Tooltip>
						</div>
					</div>

					<!-- Card Body -->
					<div class="p-5 pt-3">
						<!-- Description -->
						<p class="mb-4 line-clamp-2 min-h-[40px] text-sm text-gray-500 dark:text-gray-400">
							{course.description
								? truncateText(course.description, 120)
								: 'Sin descripción disponible'}
						</p>

						{#if course.lastProgressRebuild}
							<div
								class="mb-4 rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300"
							>
								<p class="font-semibold">Última regeneración</p>
								<p>
									{formatRebuildDate(course.lastProgressRebuild.rebuildAt)} · {getRebuildModeLabel(
										course.lastProgressRebuild.mode
									)}
								</p>
							</div>
						{/if}

						<!-- Teachers Section -->
						<div class="mb-4">
							<p
								class="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500"
							>
								Profesores
							</p>
							{#if teachers.length > 0}
								<div class="flex items-center gap-2">
									<div class="flex -space-x-2">
										{#each teachers.slice(0, 3) as teacher (teacher.userId)}
											<Avatar
												src={teacher.image ?? undefined}
												alt={teacher.username ?? 'Profesor'}
												size="sm"
												class="ring-2 ring-white dark:ring-gray-800"
											/>
										{/each}
										{#if teachers.length > 3}
											<div
												class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 ring-2 ring-white dark:bg-gray-700 dark:ring-gray-800"
											>
												<span class="text-xs font-medium text-gray-600 dark:text-gray-300"
													>+{teachers.length - 3}</span
												>
											</div>
										{/if}
									</div>
									<div class="ml-2 flex flex-wrap gap-1">
										{#each teachers.slice(0, 2) as teacher (teacher.userId)}
											<Badge color={getRoleBadgeColor(teacher.role)} class="text-xs">
												{teacher.username ?? 'Sin nombre'}
											</Badge>
										{/each}
										{#if teachers.length > 2}
											<Badge color="gray" class="text-xs">+{teachers.length - 2}</Badge>
										{/if}
									</div>
								</div>
							{:else}
								<p class="text-sm text-gray-400 italic">Sin profesores asignados</p>
							{/if}
						</div>

						<!-- Stats Row -->
						<div
							class="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-700"
						>
							<div class="flex items-center gap-4">
								<div class="flex items-center gap-1.5">
									<UsersSolid class="h-4 w-4 {getAccentColor(index)}" />
									<span class="text-sm font-semibold text-gray-700 dark:text-gray-300"
										>{studentCount}</span
									>
									<span class="text-xs text-gray-400">alumnos</span>
								</div>
								<div class="flex items-center gap-1.5">
									<BookOpenSolid class="h-4 w-4 text-purple-500" />
									<span class="text-sm font-semibold text-gray-700 dark:text-gray-300"
										>{course.activityCount || 0}</span
									>
									<span class="text-xs text-gray-400">actividades</span>
								</div>
							</div>
							<Button
								size="xs"
								color="blue"
								outline
								href="/admin/courses/{course.id}"
								class="group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20"
							>
								Ver detalles
							</Button>
						</div>
					</div>
				</Card>
			{/each}
		</div>

		<!-- Results summary -->
		<div class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
			{#if searchTerm}
				Mostrando {filteredCourses.length} de {data.courses.length} cursos
			{:else}
				{data.courses.length} cursos en total
			{/if}
		</div>
	{:else}
		<!-- Empty State -->
		<Card class="!p-12">
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"
				>
					<BookOpenSolid class="h-10 w-10 text-gray-400 dark:text-gray-500" />
				</div>
				{#if searchTerm}
					<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
						No se encontraron resultados
					</h3>
					<p class="mb-4 text-gray-500 dark:text-gray-400">
						No hay cursos que coincidan con "<span class="font-medium">{searchTerm}</span>"
					</p>
					<Button color="light" onclick={() => (searchTerm = '')}>Limpiar búsqueda</Button>
				{:else}
					<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
						No hay cursos registrados
					</h3>
					<p class="mb-4 text-gray-500 dark:text-gray-400">
						Comienza creando tu primer curso para organizar tu contenido educativo
					</p>
					<Button color="blue" href="/admin/courses/new">
						<PlusOutline class="me-2 h-4 w-4" />
						Crear Primer Curso
					</Button>
				{/if}
			</div>
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
