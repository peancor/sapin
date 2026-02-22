<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import {
		Users,
		BookOpen,
		Activity,
		Clock,
		GraduationCap,
		Settings,
		Eye,
		ChevronRight,
		RefreshCw
	} from 'lucide-svelte';
	import { Badge, Button, Modal, Spinner } from 'flowbite-svelte';

	let { data }: { data: PageData } = $props();

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
	function getActivityStatusColor(status: string): 'green' | 'yellow' | 'orange' | 'gray' {
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

	function getActivityStatusLabel(status: string): string {
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

	// Role badge helpers
	function getRoleBadgeColor(role: string): 'purple' | 'red' | 'blue' | 'green' | 'gray' {
		switch (role) {
			case 'owner':
				return 'purple';
			case 'admin':
				return 'red';
			case 'teacher':
				return 'blue';
			case 'assistant':
				return 'green';
			default:
				return 'gray';
		}
	}

	function getRoleDisplayName(role: string) {
		switch (role) {
			case 'owner':
				return 'Propietario';
			case 'admin':
				return 'Administrador';
			case 'teacher':
				return 'Profesor';
			case 'assistant':
				return 'Asistente';
			default:
				return role;
		}
	}

	const defaultCourseImage = '/images/default-course.jpg';

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

	let showRebuildModal = $state(false);
	let rebuildMode = $state<'fill_missing' | 'rebuild_all'>('fill_missing');
	let isRebuilding = $state(false);
	let rebuildResult = $state<{ success: boolean; message: string } | null>(null);

	async function rebuildCourseProgress() {
		isRebuilding = true;
		rebuildResult = null;

		try {
			const response = await fetch(`/api/admin/courses/${data.course.id}/progress/rebuild`, {
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
</script>

<div class="space-y-6">
	<!-- Course Banner -->
	<div class="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
		<div class="relative h-40 overflow-hidden md:h-52">
			<img
				src={data.course.image || defaultCourseImage}
				alt={data.course.name}
				class="h-full w-full object-cover"
			/>
			<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
			></div>
			<div class="absolute right-0 bottom-0 left-0 p-6">
				<div class="flex items-center gap-3 mb-2">
					<Badge color={getStatusBadgeColor(data.course.status)} class="text-sm">
						{getStatusLabel(data.course.status)}
					</Badge>
					{#if data.lastProgressRebuild}
						<Badge color="yellow" class="text-xs">
							Regenerado: {getRebuildModeLabel(data.lastProgressRebuild.mode)}
						</Badge>
					{/if}
				</div>
				<h1 class="text-2xl font-bold text-white md:text-3xl">{data.course.name}</h1>
				{#if data.course.description}
					<p class="mt-2 line-clamp-2 max-w-2xl text-sm text-gray-200 md:text-base">
						{data.course.description}
					</p>
				{/if}
				{#if data.lastProgressRebuild}
					<p class="mt-1 text-xs text-gray-200">
						Última regeneración: {formatRebuildDate(data.lastProgressRebuild.rebuildAt)}
					</p>
				{/if}
			</div>
			<div class="absolute top-4 right-4 flex gap-2">
				<button
					type="button"
					onclick={() => {
						rebuildMode = 'fill_missing';
						rebuildResult = null;
						showRebuildModal = true;
					}}
					class="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
				>
					<RefreshCw class="h-4 w-4" />
					Regenerar progreso
				</button>
				<a
					href="/course/{data.course.id}/run"
					class="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
				>
					<Eye class="h-4 w-4" />
					Vista estudiante
				</a>
				<a
					href="/admin/courses/{data.course.id}/edit"
					class="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
				>
					<Settings class="h-4 w-4" />
					Configuración
				</a>
			</div>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<a
			href="/admin/courses/{data.course.id}/teachers"
			class="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800"
		>
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/50">
					<Users class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Profesores</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.teachers?.length || 0}
					</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/courses/{data.course.id}/students"
			class="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800"
		>
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-green-100 p-3 dark:bg-green-900/50">
					<GraduationCap class="h-6 w-6 text-green-600 dark:text-green-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Estudiantes</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.students?.length || 0}
					</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/courses/{data.course.id}/interactives"
			class="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800"
		>
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-purple-100 p-3 dark:bg-purple-900/50">
					<BookOpen class="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Actividades</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.interactives?.length || 0}
					</p>
				</div>
			</div>
		</a>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-amber-100 p-3 dark:bg-amber-900/50">
					<Activity class="h-6 w-6 text-amber-600 dark:text-amber-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Estado</p>
					<Badge color={getStatusBadgeColor(data.course.status)} class="text-sm">
						{getStatusLabel(data.course.status)}
					</Badge>
				</div>
			</div>
		</div>
	</div>

	<!-- Two Column Layout -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Teachers Section -->
		<div class="rounded-xl bg-white shadow-sm dark:bg-gray-800">
			<div
				class="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700"
			>
				<div>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Profesores</h2>
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{data.teachers?.length || 0} profesores asignados
					</p>
				</div>
				<a
					href="/admin/courses/{data.course.id}/teachers"
					class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 flex items-center gap-1 text-sm font-medium"
				>
					Ver todos
					<ChevronRight class="h-4 w-4" />
				</a>
			</div>
			<div class="p-5">
				{#if data.teachers && data.teachers.length > 0}
					<div class="space-y-3">
						{#each data.teachers.slice(0, 5) as teacher (teacher.id)}
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<img
										src={teacher.image || '/images/default_avatar.png'}
										alt={teacher.username || 'Profesor'}
										class="h-10 w-10 rounded-full object-cover"
									/>
									<div>
										<p class="font-medium text-gray-900 dark:text-white">
											{teacher.username || 'Sin nombre'}
										</p>
										<p class="text-sm text-gray-500 dark:text-gray-400">
											{teacher.email || '-'}
										</p>
									</div>
								</div>
								<Badge color={getRoleBadgeColor(teacher.role)}>
									{getRoleDisplayName(teacher.role)}
								</Badge>
							</div>
						{/each}
					</div>
					{#if data.teachers.length > 5}
						<div class="mt-4 border-t border-gray-100 pt-4 text-center dark:border-gray-700">
							<a
								href="/admin/courses/{data.course.id}/teachers"
								class="text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline"
							>
								Ver {data.teachers.length - 5} profesores más →
							</a>
						</div>
					{/if}
				{:else}
					<div class="py-8 text-center">
						<Users class="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
						<p class="text-gray-500 dark:text-gray-400">No hay profesores asignados</p>
						<Button
							href="/admin/courses/{data.course.id}/teachers"
							color="light"
							size="sm"
							class="mt-3"
						>
							Añadir profesores
						</Button>
					</div>
				{/if}
			</div>
		</div>

		<!-- Students Section -->
		<div class="rounded-xl bg-white shadow-sm dark:bg-gray-800">
			<div
				class="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700"
			>
				<div>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Estudiantes</h2>
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{data.students?.length || 0} estudiantes inscritos
					</p>
				</div>
				<a
					href="/admin/courses/{data.course.id}/students"
					class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 flex items-center gap-1 text-sm font-medium"
				>
					Ver todos
					<ChevronRight class="h-4 w-4" />
				</a>
			</div>
			<div class="p-5">
				{#if data.students && data.students.length > 0}
					<div class="space-y-3">
						{#each data.students.slice(0, 5) as student (student.id)}
							<div class="flex items-center gap-3">
								<img
									src={student.image || '/images/default_avatar.png'}
									alt={student.username || 'Estudiante'}
									class="h-10 w-10 rounded-full object-cover"
								/>
								<div>
									<p class="font-medium text-gray-900 dark:text-white">
										{student.username || 'Sin nombre'}
									</p>
									<p class="text-sm text-gray-500 dark:text-gray-400">
										{student.email || '-'}
									</p>
								</div>
							</div>
						{/each}
					</div>
					{#if data.students.length > 5}
						<div class="mt-4 border-t border-gray-100 pt-4 text-center dark:border-gray-700">
							<a
								href="/admin/courses/{data.course.id}/students"
								class="text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline"
							>
								Ver {data.students.length - 5} estudiantes más →
							</a>
						</div>
					{/if}
				{:else}
					<div class="py-8 text-center">
						<GraduationCap class="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
						<p class="text-gray-500 dark:text-gray-400">No hay estudiantes inscritos</p>
						<Button
							href="/admin/courses/{data.course.id}/students"
							color="light"
							size="sm"
							class="mt-3"
						>
							Añadir estudiantes
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Activities Section -->
	<div class="rounded-xl bg-white shadow-sm dark:bg-gray-800">
		<div
			class="flex flex-col gap-3 border-b border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700"
		>
			<div>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
					Actividades de aprendizaje
				</h2>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					{data.interactives?.length || 0} actividades en este curso
				</p>
			</div>
			<a
				href="/admin/courses/{data.course.id}/interactives"
				class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
			>
				<BookOpen class="h-4 w-4" />
				Ver todas
			</a>
		</div>

		{#if data.interactives && data.interactives.length > 0}
			<div class="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.interactives.slice(0, 6) as interactive (interactive.id)}
					<div
						class="rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md dark:border-gray-700"
					>
						<div class="mb-2 flex items-start justify-between">
							<span class="font-medium text-gray-900 dark:text-white">
								{interactive.name}
							</span>
							<Badge color={getActivityStatusColor(interactive.status)} class="text-xs">
								{getActivityStatusLabel(interactive.status)}
							</Badge>
						</div>
						<p class="mb-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
							{interactive.description || 'Sin descripción'}
						</p>
						<Badge color={getTypeColor(interactive.type)} class="text-xs capitalize">
							{interactive.type}
						</Badge>
					</div>
				{/each}
			</div>
			{#if data.interactives.length > 6}
				<div class="border-t border-gray-200 p-4 text-center dark:border-gray-700">
					<a
						href="/admin/courses/{data.course.id}/interactives"
						class="text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline"
					>
						Ver las {data.interactives.length - 6} actividades restantes →
					</a>
				</div>
			{/if}
		{:else}
			<div class="p-12 text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
				>
					<BookOpen class="h-8 w-8 text-gray-400" />
				</div>
				<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">No hay actividades</h3>
				<p class="mb-4 text-gray-500 dark:text-gray-400">
					Este curso aún no tiene actividades de aprendizaje
				</p>
			</div>
		{/if}
	</div>
</div>

<Modal bind:open={showRebuildModal} size="sm" class="backdrop-blur-sm">
	<div class="p-2">
		<h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white text-center">
			Regenerar progreso
		</h3>
		<p class="mb-4 text-sm text-gray-500 dark:text-gray-400 text-center">
			Curso: <span class="font-semibold text-gray-900 dark:text-white">{data.course.name}</span>
		</p>

		<div class="mb-4 space-y-2">
			<label
				class="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
			>
				<input type="radio" bind:group={rebuildMode} value="fill_missing" class="mt-1" />
				<span class="text-sm text-gray-700 dark:text-gray-300">
					<strong>Solo faltantes</strong><br />
					Crea progreso solo donde no exista registro previo.
				</span>
			</label>
			<label
				class="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
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

		<div class="flex flex-col sm:flex-row justify-center gap-3">
			<Button
				color="alternative"
				onclick={() => {
					showRebuildModal = false;
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
