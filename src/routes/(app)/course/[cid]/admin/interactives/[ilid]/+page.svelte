<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Users,
		MessageSquare,
		CheckCircle2,
		Activity,
		Clock,
		BarChart3,
		Eye,
		Edit,
		Settings,
		AlertCircle,
		ArrowLeft
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const { cid, ilid } = page.params;

	function formatDate(date: string | number | Date | null | undefined) {
		if (!date) return 'Sin actividad';
		const dateObj = date instanceof Date ? date : new Date(date);
		return dateObj.toLocaleDateString('es-ES', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Quick actions
	const quickActions = $derived([
		{
			label: 'Ver estudiantes',
			href: resolve(`/course/${cid}/admin/interactives/${ilid}/students`),
			icon: Users,
			color: 'blue',
			description: 'Ver el progreso de cada estudiante'
		},
		{
			label: 'Revisar respuestas',
			href: resolve(`/course/${cid}/admin/interactives/${ilid}/chat-review`),
			icon: Eye,
			color: 'green',
			description: 'Revisar las conversaciones de los estudiantes'
		},
		{
			label: 'Editar actividad',
			href: resolve(`/course/${cid}/admin/interactives/${ilid}/chatedit`),
			icon: Edit,
			color: 'purple',
			description: 'Modificar la configuración del chat'
		},
		{
			label: 'Generar insights',
			href: resolve(`/course/${cid}/admin/interactives/${ilid}/insights`),
			icon: BarChart3,
			color: 'amber',
			description: 'Análisis detallado con IA'
		}
	]);
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header with back arrow -->
	<div class="sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm">
		<div class="container mx-auto px-4 max-w-screen-xl">
			<div class="flex items-center gap-4 py-4">
				<a
					href="/course/{cid}/admin"
					class="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					title="Volver al curso"
				>
					<ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
				</a>
				<div class="min-w-0 flex-1">
					<h1 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
						Visión general: {data.interactive.name}
					</h1>
				</div>
			</div>
		</div>
	</div>

	<!-- Content Area -->
	<div class="container mx-auto px-4 py-6 max-w-screen-xl space-y-6">
	<!-- Activity Banner -->
	<div class="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
		<div class="relative overflow-hidden bg-linear-to-br from-blue-500 via-blue-600 to-indigo-700 p-6">
			<div class="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10"></div>
			<div class="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/10"></div>
			<div class="relative">
				<div class="mb-2 flex items-center gap-2">
					<span
						class="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white"
					>
						{data.interactive.type || 'chat'}
					</span>
				</div>
				<h1 class="text-2xl font-bold text-white md:text-3xl">{data.interactive.name}</h1>
				{#if data.interactive.description}
					<p class="mt-2 max-w-2xl text-blue-100">
						{data.interactive.description}
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/50">
					<Users class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Estudiantes</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.stats.studentsWithActivity} / {data.stats.totalStudents}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						{data.stats.participationRate}% participación
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-green-100 p-3 dark:bg-green-900/50">
					<CheckCircle2 class="h-6 w-6 text-green-600 dark:text-green-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Completados</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.stats.studentsCompleted}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						{data.stats.completionRate}% del total
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-purple-100 p-3 dark:bg-purple-900/50">
					<MessageSquare class="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Total mensajes</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.stats.totalMessages}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						~{data.stats.averageMessagesPerChat} por chat
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-amber-100 p-3 dark:bg-amber-900/50">
					<Clock class="h-6 w-6 text-amber-600 dark:text-amber-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Última actividad</p>
					<p class="text-sm font-medium text-gray-900 dark:text-white">
						{formatDate(data.stats.lastActivityDate)}
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
		<h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Acciones rápidas</h2>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each quickActions as action (action.label)}
				<a
					href={action.href}
					class="group flex flex-col rounded-lg border border-gray-200 p-4 transition-all hover:border-{action.color}-300 hover:bg-{action.color}-50 dark:border-gray-700 dark:hover:border-{action.color}-800 dark:hover:bg-{action.color}-900/20"
				>
					<div
						class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-{action.color}-100 text-{action.color}-600 dark:bg-{action.color}-900/50 dark:text-{action.color}-400"
					>
						<action.icon class="h-5 w-5" />
					</div>
					<h3 class="font-medium text-gray-900 dark:text-white">{action.label}</h3>
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{action.description}</p>
				</a>
			{/each}
		</div>
	</div>

	<!-- Activity Configuration -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Configuration Summary -->
		<div class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
					Configuración de la actividad
				</h2>
				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}/chatedit`)}
					class="text-sm text-primary-600 hover:underline dark:text-primary-400"
				>
					Editar
				</a>
			</div>
			<div class="space-y-4">
				<div class="flex items-start gap-3">
					<Settings class="mt-0.5 h-5 w-5 text-gray-400" />
					<div>
						<p class="text-sm font-medium text-gray-900 dark:text-white">Rol del asistente</p>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							{data.chatConfig?.llmRole || 'No configurado'}
						</p>
					</div>
				</div>
				{#if data.chatConfig?.llmInstructions}
					<div class="flex items-start gap-3">
						<MessageSquare class="mt-0.5 h-5 w-5 text-gray-400" />
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">Instrucciones</p>
							<p class="line-clamp-3 text-sm text-gray-500 dark:text-gray-400">
								{data.chatConfig.llmInstructions}
							</p>
						</div>
					</div>
				{/if}
				<div class="flex items-start gap-3">
					<Activity class="mt-0.5 h-5 w-5 text-gray-400" />
					<div>
						<p class="text-sm font-medium text-gray-900 dark:text-white">
							Criterio de finalización
						</p>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Mínimo {data.stats.requiresMinMessages} mensajes + marca [[DONE]]
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Progress Overview -->
		<div class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
			<h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Progreso general</h2>

			<!-- Participation Progress -->
			<div class="mb-6">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Participación</span>
					<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
						{data.stats.participationRate}%
					</span>
				</div>
				<div class="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
					<div
						class="h-2.5 rounded-full bg-blue-600"
						style="width: {data.stats.participationRate}%"
					></div>
				</div>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					{data.stats.studentsWithActivity} de {data.stats.totalStudents} estudiantes han participado
				</p>
			</div>

			<!-- Completion Progress -->
			<div>
				<div class="mb-2 flex items-center justify-between">
					<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Finalización</span>
					<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
						{data.stats.completionRate}%
					</span>
				</div>
				<div class="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
					<div
						class="h-2.5 rounded-full bg-green-600"
						style="width: {data.stats.completionRate}%"
					></div>
				</div>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					{data.stats.studentsCompleted} de {data.stats.totalStudents} estudiantes han completado
				</p>
			</div>

			{#if data.stats.studentsWithActivity > 0 && data.stats.studentsCompleted < data.stats.studentsWithActivity}
				<div class="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
					<AlertCircle class="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
					<p class="text-sm text-amber-700 dark:text-amber-300">
						{data.stats.studentsWithActivity - data.stats.studentsCompleted} estudiante{data.stats.studentsWithActivity - data.stats.studentsCompleted > 1 ? 's' : ''} ha{data.stats.studentsWithActivity - data.stats.studentsCompleted > 1 ? 'n' : ''} iniciado pero no completado la actividad
					</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Preview Button -->
	<div class="flex justify-center">
		<a
			href={resolve(`/interactive-chat/${ilid}`)}
			target="_blank"
			class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-white transition-colors hover:bg-primary-700"
		>
			<Eye class="h-5 w-5" />
			Previsualizar actividad
		</a>
	</div>
	</div>
</div>
