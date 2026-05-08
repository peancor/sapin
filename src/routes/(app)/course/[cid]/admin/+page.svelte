<script lang="ts">
	import type { PageData } from './$types';
	import {
		Users,
		BookOpen,
		Activity,
		MoreVertical,
		Plus,
		Eye,
		Trash2,
		Clock,
		BarChart3,
		TrendingUp,
		Bot
	} from 'lucide-svelte';
	import { Modal, Dropdown, DropdownItem, Button, Toast, Badge } from 'flowbite-svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import MoodleActivityLinkMenu from '$lib/components/MoodleActivityLinkMenu.svelte';

	let { data }: { data: PageData } = $props();

	let deleteModal = $state(false);
	let interactiveToDelete = $state<(typeof data.interactives)[number] | null>(null);

	// Toast notification state
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');

	function showToastMessage(message: string, type: 'success' | 'error') {
		toastMessage = message;
		toastType = type;
		showToast = true;
		setTimeout(() => {
			showToast = false;
		}, 6000);
	}

	function confirmDelete(interactive: (typeof data.interactives)[number]) {
		interactiveToDelete = interactive;
		deleteModal = true;
	}

	function getPreviewUrl(interactive: { id: string; type: string }): string {
		if (interactive.type === 'agent') return `/agent-chat/${interactive.id}`;
		if (interactive.type === 'lesson') return `/lesson/${interactive.id}`;
		return `/interactive-chat/${interactive.id}`;
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

	function formatRelativeDate(date: Date | string | null | undefined): string {
		if (!date) return 'Sin actividad';
		const parsed = new Date(date);
		return parsed.toLocaleString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDuration(seconds: number): string {
		if (!seconds || seconds <= 0) return '0m';
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function getEventTypeLabel(eventType: string): string {
		switch (eventType) {
			case 'completed':
				return 'Completó';
			case 'started':
				return 'Inició';
			case 'progressed':
				return 'Avanzó';
			default:
				return 'Registró actividad en';
		}
	}

	function getEventTypeBadgeColor(eventType: string): 'green' | 'blue' | 'purple' | 'gray' {
		switch (eventType) {
			case 'completed':
				return 'green';
			case 'started':
				return 'blue';
			case 'progressed':
				return 'purple';
			default:
				return 'gray';
		}
	}

	const maxTrend = $derived(Math.max(1, ...data.analytics.trend14d.map((point) => point.total)));
	const topActivityCompletion = $derived(
		Math.max(1, ...data.analytics.activityAnalytics.map((activity) => activity.completionRate))
	);
</script>

<div class="space-y-6">
	<!-- Course Banner -->
	<div class="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
		<div class="relative h-40 overflow-hidden md:h-52">
			<img
				src={data.course.image || '/images/default-course.jpg'}
				alt={data.course.name}
				class="h-full w-full object-cover"
			/>
			<div
				class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
			></div>
			<div class="absolute right-0 bottom-0 left-0 p-6">
				<h1 class="text-2xl font-bold text-white md:text-3xl">{data.course.name}</h1>
				{#if data.course.description}
					<p class="mt-2 line-clamp-2 max-w-2xl text-sm text-gray-200 md:text-base">
						{data.course.description}
					</p>
				{/if}
			</div>
			<div class="absolute top-4 right-4">
				<a
					href={resolve(`/course/${data.course.id}/admin/edit`)}
					class="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
				>
					Editar curso
				</a>
			</div>
		</div>
	</div>

	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-xl font-bold text-gray-900 dark:text-white">Resumen del curso</h2>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a
				href={resolve(`/course/${data.course.id}/admin/course-agent`)}
				class="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
			>
				<Bot class="h-4 w-4" />
				Agente del curso
			</a>
			<a
				href={resolve(`/course/${data.course.id}/admin/analytics`)}
				class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
			>
				<BarChart3 class="h-4 w-4" />
				Analytics avanzado
			</a>
			<a
				href={resolve(`/course/${data.course.id}/admin/interactives/new`)}
				class="bg-primary-600 hover:bg-primary-700 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors"
			>
				<Plus class="h-4 w-4" />
				Nueva actividad
			</a>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/50">
					<Users class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Estudiantes</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.enrolledStudents?.length || 0}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-green-100 p-3 dark:bg-green-900/50">
					<BookOpen class="h-6 w-6 text-green-600 dark:text-green-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Actividades</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.interactives?.length || 0}
					</p>
				</div>
			</div>
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<div class="flex items-center gap-4">
				<div class="rounded-lg bg-purple-100 p-3 dark:bg-purple-900/50">
					<Activity class="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Participaciones</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.analytics.participants}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						{data.analytics.participationRate}% de estudiantes
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
						{formatRelativeDate(data.analytics.lastActivityAt)}
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Learning Analytics -->
	<div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
		<div class="rounded-xl bg-white p-5 shadow-sm xl:col-span-2 dark:bg-gray-800">
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
						Tendencia de actividad (14 días)
					</h3>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Eventos de progreso registrados por día
					</p>
				</div>
				<TrendingUp class="h-5 w-5 text-gray-400" />
			</div>
			<div class="grid h-44 grid-cols-14 items-end gap-2">
				{#each data.analytics.trend14d as point (point.date)}
					<div class="flex h-full flex-col items-center justify-end gap-2">
						<div
							class="w-full rounded-t bg-blue-500/80"
							style={`height: ${Math.max(6, Math.round((point.total / maxTrend) * 120))}px`}
						></div>
						<span class="text-[10px] text-gray-500 dark:text-gray-400"
							>{new Date(point.date).getDate()}</span
						>
					</div>
				{/each}
			</div>
		</div>

		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white">KPIs de aprendizaje</h3>
			<div class="mt-4 space-y-4">
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Progreso global</p>
					<p class="text-2xl font-bold text-gray-900 dark:text-white">
						{data.analytics.overallCompletionRate}%
					</p>
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Media por estudiante</p>
					<p class="text-xl font-semibold text-gray-900 dark:text-white">
						{data.analytics.avgCompletionRateByStudent}%
					</p>
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Estudiantes activos (7d)</p>
					<p class="text-xl font-semibold text-gray-900 dark:text-white">
						{data.analytics.activeStudents7d}
					</p>
				</div>
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Tiempo medio por participante</p>
					<p class="text-xl font-semibold text-gray-900 dark:text-white">
						{formatDuration(data.analytics.avgTimeSpentPerParticipantSeconds)}
					</p>
				</div>
			</div>
		</div>
	</div>

	<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
		<div class="mb-4 flex items-center justify-between">
			<div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Actividad reciente</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Últimos eventos registrados por estudiantes en actividades del curso
				</p>
			</div>
			<Clock class="h-5 w-5 text-gray-400" />
		</div>

		<div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
			<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
				<p class="text-xs text-gray-500 dark:text-gray-400">Eventos (24h)</p>
				<p class="text-lg font-semibold text-gray-900 dark:text-white">
					{data.analytics.recentActivityStats.events24h}
				</p>
			</div>
			<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
				<p class="text-xs text-gray-500 dark:text-gray-400">Completadas (24h)</p>
				<p class="text-lg font-semibold text-gray-900 dark:text-white">
					{data.analytics.recentActivityStats.completed24h}
				</p>
			</div>
			<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
				<p class="text-xs text-gray-500 dark:text-gray-400">Estudiantes activos (24h)</p>
				<p class="text-lg font-semibold text-gray-900 dark:text-white">
					{data.analytics.recentActivityStats.activeStudents24h}
				</p>
			</div>
		</div>

		{#if data.analytics.recentActivities.length > 0}
			<div class="space-y-3">
				{#each data.analytics.recentActivities as event (event.eventAt.toISOString() + event.userId + event.activityId)}
					<div
						class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
					>
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								<a
									href={resolve(`/course/${data.course.id}/admin/students/${event.userId}`)}
									class="hover:text-primary-600 dark:hover:text-primary-400 underline-offset-2 hover:underline"
								>
									{event.studentLabel}
								</a>
								· {getEventTypeLabel(event.eventType)}
								{#if event.activityCount === 1}
									<a
										href={resolve(
											`/course/${data.course.id}/admin/interactives/${event.activityId}`
										)}
										class="hover:text-primary-600 dark:hover:text-primary-400 underline-offset-2 hover:underline"
									>
										{event.activityName}
									</a>
								{:else}
									{event.activityName}
								{/if}
							</p>
							<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
								{formatRelativeDate(event.eventAt)}
								{#if event.eventCount > 1}
									· {event.eventCount} eventos en {event.activityCount} actividades
								{/if}
							</p>
						</div>
						<div class="flex items-center gap-2">
							<Badge color={getTypeColor(event.activityType)} class="text-xs capitalize"
								>{event.activityType}</Badge
							>
							<Badge color={getEventTypeBadgeColor(event.eventType)} class="text-xs"
								>{getEventTypeLabel(event.eventType)}</Badge
							>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-gray-500 dark:text-gray-400">Sin actividad reciente para mostrar.</p>
		{/if}
	</div>

	<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
		<div class="mb-4">
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Rendimiento por actividad</h3>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Completado por porcentaje de estudiantes
			</p>
		</div>
		<div class="space-y-3">
			{#each data.analytics.activityAnalytics as activity (activity.activityId)}
				<div>
					<div class="mb-1 flex items-center justify-between text-sm">
						<span class="font-medium text-gray-800 dark:text-gray-200">{activity.name}</span>
						<span class="text-gray-500 dark:text-gray-400"
							>{activity.completedStudents}/{data.analytics.totalStudents}</span
						>
					</div>
					<div class="h-2 w-full rounded bg-gray-200 dark:bg-gray-700">
						<div
							class="h-2 rounded bg-green-500"
							style={`width: ${Math.max(2, Math.round((activity.completionRate / topActivityCompletion) * 100))}%`}
						></div>
					</div>
				</div>
			{/each}
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
				href={resolve(`/course/${data.course.id}/admin/interactives`)}
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
							<a
								href={resolve(`/course/${data.course.id}/admin/interactives/${interactive.id}`)}
								class="hover:text-primary-600 dark:hover:text-primary-400 font-medium text-gray-900 dark:text-white"
							>
								{interactive.name}
							</a>
							<div class="flex items-center gap-1">
								<Badge color={getStatusColor(interactive.status)} class="text-xs">
									{getStatusLabel(interactive.status)}
								</Badge>
							</div>
						</div>
						<p class="mb-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
							{interactive.description || 'Sin descripción'}
						</p>
						<div class="flex items-center justify-between">
							<Badge color={getTypeColor(interactive.type)} class="text-xs capitalize">
								{interactive.type}
							</Badge>
							<div class="flex items-center gap-1">
								<MoodleActivityLinkMenu
									{interactive}
									notify={showToastMessage}
									triggerIdPrefix="dashboard-moodle-link"
									buttonClass="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-1.5 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
								/>
								<Button color="light" class="!p-1.5">
									<MoreVertical class="h-4 w-4" />
								</Button>
								<Dropdown>
									<DropdownItem href={getPreviewUrl(interactive)}>
										<Eye class="mr-2 h-4 w-4" />
										Previsualizar
									</DropdownItem>
									<DropdownItem
										class="text-red-600 hover:!bg-red-50 dark:text-red-400 dark:hover:!bg-red-900/20"
										onclick={() => confirmDelete(interactive)}
									>
										<Trash2 class="mr-2 h-4 w-4" />
										Eliminar
									</DropdownItem>
								</Dropdown>
							</div>
						</div>
					</div>
				{/each}
			</div>
			{#if data.interactives.length > 6}
				<div class="border-t border-gray-200 p-4 text-center dark:border-gray-700">
					<a
						href={resolve(`/course/${data.course.id}/admin/interactives`)}
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
					Crea tu primera actividad de aprendizaje interactivo
				</p>
				<a
					href={resolve(`/course/${data.course.id}/admin/interactives/new`)}
					class="bg-primary-600 hover:bg-primary-700 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
				>
					<Plus class="h-4 w-4" />
					Nueva actividad
				</a>
			</div>
		{/if}
	</div>
</div>

<Modal bind:open={deleteModal} size="md" autoclose={false}>
	<div class="text-center">
		<h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
			¿Estás seguro de que deseas eliminar esta actividad de aprendizaje interactivo?
		</h3>
		<p class="mb-5 font-semibold text-gray-800 dark:text-gray-200">
			{interactiveToDelete?.name}
		</p>
		<form
			method="POST"
			action="?/deleteInteractive"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						deleteModal = false;
						await update(); // Esto actualizará la página con los nuevos datos
						console.log('Actividad eliminada');
					}
				};
			}}
			class="flex justify-center gap-4"
		>
			<input type="hidden" name="id" value={interactiveToDelete?.id} />
			<button
				type="button"
				class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
				onclick={() => (deleteModal = false)}
			>
				Cancelar
			</button>
			<button
				type="submit"
				class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
			>
				Eliminar
			</button>
		</form>
	</div>
</Modal>

<!-- Toast notification -->
{#if showToast}
	<div class="fixed right-4 bottom-4 z-50">
		<Toast color={toastType === 'success' ? 'green' : 'red'}>
			{#snippet icon()}
				{#if toastType === 'success'}
					<svg
						class="h-5 w-5"
						fill="currentColor"
						viewBox="0 0 20 20"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						></path>
					</svg>
				{:else}
					<svg
						class="h-5 w-5"
						fill="currentColor"
						viewBox="0 0 20 20"
						xmlns="http://www.w3.org/2000/svg"
					>
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
