<script lang="ts">
	import type { PageData } from './$types';
	import {
		GraduationCap,
		BookOpen,
		Users,
		Plus,
		ArrowRight,
		ChevronRight,
		Sparkles,
		PenTool,
		Layout
	} from 'lucide-svelte';
	import { Button, Card, Badge, Avatar } from 'flowbite-svelte';
	import CreateCourseModal from '$lib/components/CreateCourseModal.svelte';

	let { data }: { data: PageData } = $props();

	let showCreateModal = $state(false);

	const teacherGradients = [
		'from-violet-500/80 to-purple-600/80',
		'from-blue-500/80 to-indigo-600/80',
		'from-cyan-500/80 to-blue-600/80',
		'from-emerald-500/80 to-teal-600/80'
	];

	const studentGradients = [
		'from-blue-300/60 via-indigo-200/60 to-violet-300/60',
		'from-rose-200/60 via-pink-200/60 to-purple-300/60',
		'from-sky-200/60 via-cyan-200/60 to-blue-300/60',
		'from-teal-200/60 via-emerald-200/60 to-green-300/60'
	];

	function truncateText(text: string | null | undefined, maxLength: number) {
		if (!text) return 'Sin descripción';
		return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
	}

	function getRoleLabel(role: string): string {
		switch (role) {
			case 'owner':
				return 'Propietario';
			case 'admin':
				return 'Administrador';
			case 'teacher':
				return 'Profesor';
			case 'assistant':
				return 'Asistente';
			case 'student':
				return 'Estudiante';
			default:
				return 'Participante';
		}
	}

	function getRoleBadgeColor(role: string): 'purple' | 'blue' | 'green' | 'yellow' | 'indigo' {
		switch (role) {
			case 'owner':
				return 'purple';
			case 'admin':
				return 'indigo';
			case 'teacher':
				return 'blue';
			case 'assistant':
				return 'yellow';
			default:
				return 'green';
		}
	}
</script>

<svelte:head>
	<title>Mi Espacio - SAPIN</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-8 p-4 md:p-6">
	<!-- Header de bienvenida -->
	<div
		class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 text-white shadow-xl"
	>
		<div class="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 opacity-20">
			<Sparkles class="h-64 w-64" />
		</div>
		<div class="relative z-10">
			<div class="flex flex-col gap-4 md:flex-row md:items-center">
				<Avatar
					src={data.user?.image || '/images/default_avatar.png'}
					size="lg"
					class="ring-4 ring-white/30"
				/>
				<div>
					<h1 class="mb-2 text-3xl font-bold md:text-4xl">
						¡Hola, {data.user?.username?.split(' ')[0] || 'Usuario'}!
					</h1>
					<p class="text-lg text-blue-100">Bienvenido a tu espacio de aprendizaje</p>
				</div>
			</div>

			<!-- Stats rápidos -->
			<div class="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
				<div class="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-white/20 p-2">
							<BookOpen class="h-5 w-5" />
						</div>
						<div>
							<p class="text-2xl font-bold">{data.totalCourses}</p>
							<p class="text-sm text-blue-100">Cursos totales</p>
						</div>
					</div>
				</div>
				<div class="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-white/20 p-2">
							<PenTool class="h-5 w-5" />
						</div>
						<div>
							<p class="text-2xl font-bold">{data.teachingCourses.length}</p>
							<p class="text-sm text-blue-100">Como docente</p>
						</div>
					</div>
				</div>
				<div class="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-white/20 p-2">
							<GraduationCap class="h-5 w-5" />
						</div>
						<div>
							<p class="text-2xl font-bold">{data.learningCourses.length}</p>
							<p class="text-sm text-blue-100">Como estudiante</p>
						</div>
					</div>
				</div>
				<div class="hidden rounded-xl bg-white/10 p-4 backdrop-blur-sm md:block">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-white/20 p-2">
							<Layout class="h-5 w-5" />
						</div>
						<div>
							<p class="text-2xl font-bold">
								{data.teachingCourses.reduce((sum, c) => sum + c.activityCount, 0) +
									data.learningCourses.reduce((sum, c) => sum + c.activityCount, 0)}
							</p>
							<p class="text-sm text-blue-100">Actividades</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Sección: Cursos como Docente -->
	{#if data.teachingCourses.length > 0}
		<section>
			<div class="mb-6 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/50">
						<PenTool class="h-6 w-6 text-purple-600 dark:text-purple-400" />
					</div>
					<div>
						<h2 class="text-2xl font-bold text-gray-800 dark:text-white">
							Mis cursos como docente
						</h2>
						<p class="text-sm text-gray-600 dark:text-gray-400">Cursos que gestionas o enseñas</p>
					</div>
				</div>
				<Button href="/teacher" color="light" class="hidden items-center gap-2 md:flex">
					Ver todos
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>

			<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{#each data.teachingCourses.slice(0, 6) as course, i (course.assignmentId)}
					<Card class="group overflow-hidden border-0 transition-all duration-300 hover:shadow-xl">
						<div
							class="relative h-40 bg-gradient-to-br {teacherGradients[
								i % teacherGradients.length
							]}"
						>
							{#if course.image}
								<img
									src={course.image}
									alt={course.name}
									class="h-full w-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-105"
								/>
							{:else}
								<div class="absolute inset-0 flex items-center justify-center">
									<BookOpen class="h-16 w-16 text-white/50" />
								</div>
							{/if}
							<div class="absolute top-3 right-3">
								<Badge color={getRoleBadgeColor(course.role)}>
									{getRoleLabel(course.role)}
								</Badge>
							</div>
						</div>
						<div class="p-5">
							<h3 class="mb-2 line-clamp-1 text-lg font-bold text-gray-800 dark:text-white">
								{course.name}
							</h3>
							<p class="mb-4 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
								{truncateText(course.description, 80)}
							</p>
							<div class="flex items-center justify-between">
								<span class="text-sm text-gray-500 dark:text-gray-400">
									{course.activityCount} actividades
								</span>
								<Button href={`/course/${course.id}/admin`} size="sm" color="purple">
									Gestionar
									<ArrowRight class="ml-1 h-4 w-4" />
								</Button>
							</div>
						</div>
					</Card>
				{/each}
			</div>

			{#if data.teachingCourses.length > 6}
				<div class="mt-6 text-center md:hidden">
					<Button href="/teacher" color="light">
						Ver todos los cursos ({data.teachingCourses.length})
					</Button>
				</div>
			{/if}
		</section>
	{:else if data.user?.highestRoleLevel >= 50}
		<section>
			<div class="mb-6 flex items-center gap-3">
				<div class="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/50">
					<PenTool class="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<h2 class="text-2xl font-bold text-gray-800 dark:text-white">Mis cursos como docente</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400">Cursos que gestionas o enseñas</p>
				</div>
			</div>

			<Card
				class="border-0 bg-gradient-to-br from-purple-50 to-indigo-50 p-8 text-center dark:from-purple-900/20 dark:to-indigo-900/20"
			>
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50"
				>
					<BookOpen class="h-8 w-8 text-purple-600 dark:text-purple-400" />
				</div>
				<h3 class="mb-2 text-xl font-bold text-gray-800 dark:text-white">
					Comienza a crear contenido
				</h3>
				<p class="mx-auto mb-6 max-w-md text-gray-600 dark:text-gray-400">
					Crea tu primer curso y comparte tu conocimiento con actividades de aprendizaje interactivo
					potenciadas por IA
				</p>
				<Button
					onclick={() => (showCreateModal = true)}
					color="purple"
					size="lg"
					class="text-white"
				>
					<Plus class="mr-2 h-5 w-5" />
					Crear mi primer curso
				</Button>
			</Card>
		</section>
	{/if}

	<!-- Sección: Cursos como Estudiante -->
	<section>
		<div class="mb-6 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
					<GraduationCap class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<h2 class="text-2xl font-bold text-gray-800 dark:text-white">Mi aprendizaje</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Cursos en los que participas como estudiante
					</p>
				</div>
			</div>
			{#if data.learningCourses.length > 0}
				<Button href="/student" color="light" class="hidden items-center gap-2 md:flex">
					Ver todos
					<ChevronRight class="h-4 w-4" />
				</Button>
			{/if}
		</div>

		{#if data.learningCourses.length > 0}
			<div class="space-y-4">
				{#each data.learningCourses.slice(0, 4) as course, i (course.assignmentId)}
					<div
						class="group relative overflow-hidden rounded-xl bg-gradient-to-r {studentGradients[
							i % studentGradients.length
						]} shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl"
					>
						<div class="flex flex-col items-center gap-6 p-6 md:flex-row">
							<div class="h-32 w-full shrink-0 overflow-hidden rounded-lg bg-black/10 md:w-48">
								{#if course.image}
									<img
										src={course.image}
										alt={course.name}
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center">
										<BookOpen class="h-12 w-12 text-gray-600/50" />
									</div>
								{/if}
							</div>
							<div class="flex-1 text-center md:text-left">
								<h3 class="mb-2 text-2xl font-bold text-gray-800 dark:text-white">
									{course.name}
								</h3>
								<p class="mb-4 text-gray-700 dark:text-gray-200">
									{truncateText(course.description, 120)}
								</p>
								<div class="flex flex-wrap items-center justify-center gap-4 md:justify-start">
									<span class="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
										<BookOpen class="h-4 w-4" />
										{course.activityCount} actividades
									</span>
									<Button href={`/course/${course.id}/run`} color="dark" class="px-6">
										Continuar
										<ArrowRight class="ml-2 h-4 w-4" />
									</Button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if data.learningCourses.length > 4}
				<div class="mt-6 text-center md:hidden">
					<Button href="/student" color="light">
						Ver todos los cursos ({data.learningCourses.length})
					</Button>
				</div>
			{/if}
		{:else}
			<Card class="border-0 bg-gray-50 p-8 text-center dark:bg-gray-800/50">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50"
				>
					<GraduationCap class="h-8 w-8 text-blue-600 dark:text-blue-400" />
				</div>
				<h3 class="mb-2 text-xl font-bold text-gray-800 dark:text-white">
					Aún no estás inscrito en ningún curso
				</h3>
				<p class="mb-4 text-gray-600 dark:text-gray-400">
					Utiliza un código de inscripción para unirte a un curso como estudiante
				</p>
				<Button color="blue" class="text-white">
					<Plus class="mr-2 h-4 w-4" />
					Unirse a un curso
				</Button>
			</Card>
		{/if}
	</section>

	<!-- Acciones rápidas para docentes -->
	{#if data.teachingCourses.length > 0 || data.user?.highestRoleLevel >= 50}
		<section class="mt-8">
			<h2 class="mb-4 text-xl font-bold text-gray-800 dark:text-white">Acciones rápidas</h2>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Button
					onclick={() => (showCreateModal = true)}
					color="light"
					class="h-auto flex-col gap-2 py-4"
				>
					<Plus class="h-6 w-6 text-purple-600" />
					<span>Crear curso</span>
				</Button>
				<Button href="/teacher" color="light" class="h-auto flex-col gap-2 py-4">
					<Layout class="h-6 w-6 text-blue-600" />
					<span>Panel de docente</span>
				</Button>
				<Button href="/profile" color="light" class="h-auto flex-col gap-2 py-4">
					<Users class="h-6 w-6 text-green-600" />
					<span>Mi perfil</span>
				</Button>
				<Button href="/student" color="light" class="h-auto flex-col gap-2 py-4">
					<GraduationCap class="h-6 w-6 text-orange-600" />
					<span>Mis cursos</span>
				</Button>
			</div>
		</section>
	{/if}
</div>

<CreateCourseModal bind:show={showCreateModal} />
