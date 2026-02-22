<script lang="ts">
	import type { PageData } from './$types';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { PencilLine, ArrowLeft, Mail, Calendar, Shield, BookOpen, GraduationCap } from 'lucide-svelte';
	import { Avatar, Badge, Button } from 'flowbite-svelte';

	let { data }: { data: PageData } = $props();

	// Obtener el nivel de rol más alto del nuevo sistema
	const userHighestLevel = $derived(
		data.roles && data.roles.length > 0
			? Math.max(...data.roles.map(r => r.level))
			: 0
	);

	// Determinar si el usuario es estudiante o profesor según el nuevo sistema
	const isStudentLevel = $derived(userHighestLevel < 50);
	const isTeacherLevel = $derived(userHighestLevel >= 50);

	$effect(() => {
		breadcrumb.set([
			{ label: 'Inicio', href: '/' },
			{ label: 'Administración', href: '/admin' },
			{ label: 'Usuarios', href: '/admin/users' },
			{ label: data.user.username || data.user.email, href: `/admin/users/${data.user.id}` }
		]);
	});

	function getRoleBadgeColor(role: string): 'purple' | 'red' | 'blue' | 'green' | 'yellow' {
		switch (role) {
			case 'super_admin':
				return 'red';
			case 'admin':
				return 'purple';
			case 'teacher':
				return 'blue';
			case 'assistant':
				return 'yellow';
			default:
				return 'green';
		}
	}

	function getRoleLabel(role: string) {
		switch (role) {
			case 'super_admin':
				return 'Super Admin';
			case 'admin':
				return 'Administrador';
			case 'teacher':
				return 'Profesor';
			case 'assistant':
				return 'Asistente';
			default:
				return 'Estudiante';
		}
	}

	function getRoleBadgeColorByLevel(level: number): 'purple' | 'red' | 'blue' | 'green' | 'yellow' {
		if (level >= 100) return 'red';
		if (level >= 90) return 'purple';
		if (level >= 50) return 'blue';
		if (level >= 40) return 'yellow';
		return 'green';
	}

	function formatDate(date: Date | null) {
		if (!date) return 'No disponible';
		return new Date(date).toLocaleDateString('es-ES', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center gap-4">
		<a
			href="/admin/users"
			class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
		>
			<ArrowLeft size={20} />
		</a>
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Detalles del Usuario</h1>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Información completa del usuario
			</p>
		</div>
		<a href="/admin/users/{data.user.id}/edit">
			<Button color="primary" class="flex items-center gap-2">
				<PencilLine size={16} />
				Editar
			</Button>
		</a>
	</div>

	<!-- User Profile Card -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
		<div class="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
			<!-- Avatar -->
			<div class="shrink-0">
				<Avatar
					src={data.user.image || '/images/default_avatar.png'}
					size="xl"
					class="ring-4 ring-gray-100 dark:ring-gray-700"
				/>
			</div>

			<!-- User Info -->
			<div class="flex-1 text-center sm:text-left">
				<div class="mb-2 flex flex-col items-center gap-2 sm:flex-row">
					<h2 class="text-xl font-bold text-gray-900 dark:text-white">
						{data.user.username || 'Sin nombre'}
					</h2>
					                    <div class="flex flex-wrap gap-1">
						{#if data.roles && data.roles.length > 0}
							{#each data.roles.sort((a, b) => b.level - a.level) as r (r.id)}
								<Badge color={getRoleBadgeColorByLevel(r.level)} class="font-medium">
									{r.displayName}
								</Badge>
							{/each}
						{:else}
							<Badge color="green" class="font-medium">
								Usuario
							</Badge>
						{/if}
					</div>
				</div>

				<div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
					<div class="flex items-center justify-center gap-2 sm:justify-start">
						<Mail size={16} class="text-gray-400" />
						<span>{data.user.email}</span>
					</div>
					<div class="flex items-center justify-center gap-2 sm:justify-start">
						<Calendar size={16} class="text-gray-400" />
						<span>Registrado: {formatDate(data.user.createdAt)}</span>
					</div>
					{#if data.user.updatedAt}
						<div class="flex items-center justify-center gap-2 sm:justify-start">
							<Calendar size={16} class="text-gray-400" />
							<span>Última actualización: {formatDate(data.user.updatedAt)}</span>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<!-- Roles Card -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
			<div class="flex items-start gap-4">
				<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
					<Shield size={24} />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium text-gray-500 dark:text-gray-400">Roles</p>
					{#if data.roles && data.roles.length > 0}
						<div class="mt-1 flex flex-wrap gap-1">
							{#each data.roles.sort((a, b) => b.level - a.level) as r (r.id)}
								<Badge color={getRoleBadgeColorByLevel(r.level)} class="text-xs">
									{r.displayName}
								</Badge>
							{/each}
						</div>
					{:else}
						<p class="text-lg font-semibold text-gray-900 dark:text-white">
							Usuario
						</p>
					{/if}
				</div>
			</div>
		</div>

		{#if isStudentLevel}
			<!-- Courses Enrolled -->
			<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
				<div class="flex items-center gap-4">
					<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
						<BookOpen size={24} />
					</div>
					<div>
						<p class="text-sm font-medium text-gray-500 dark:text-gray-400">Cursos matriculados</p>
						<p class="text-lg font-semibold text-gray-900 dark:text-white">
							{data.stats.coursesEnrolled}
						</p>
					</div>
				</div>
			</div>
		{/if}

		{#if isTeacherLevel}
			<!-- Courses Teaching -->
			<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
				<div class="flex items-center gap-4">
					<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
						<GraduationCap size={24} />
					</div>
					<div>
						<p class="text-sm font-medium text-gray-500 dark:text-gray-400">Cursos impartidos</p>
						<p class="text-lg font-semibold text-gray-900 dark:text-white">
							{data.stats.coursesTeaching}
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- User ID -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
			<div>
				<p class="text-sm font-medium text-gray-500 dark:text-gray-400">ID de usuario</p>
				<p class="mt-1 truncate font-mono text-sm text-gray-900 dark:text-white" title={data.user.id}>
					{data.user.id}
				</p>
			</div>
		</div>
	</div>

	<!-- Actions -->
	<div class="flex gap-3">
		<a href="/admin/users">
			<Button color="alternative">
				<ArrowLeft size={16} class="mr-2" />
				Volver a usuarios
			</Button>
		</a>
		<a href="/admin/users/{data.user.id}/edit">
			<Button color="primary">
				<PencilLine size={16} class="mr-2" />
				Editar usuario
			</Button>
		</a>
	</div>
</div>
