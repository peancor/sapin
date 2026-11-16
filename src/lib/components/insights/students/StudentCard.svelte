<script lang="ts">
	import type { StudentData } from '$lib/types/insights';
	import { insightsStore } from '$lib/stores/insights';
	import { formatDistanceToNow } from 'date-fns';
	import { es } from 'date-fns/locale';

	interface Props {
		student: StudentData;
		isSelected: boolean;
	}

	let { student, isSelected }: Props = $props();

	function toggleSelection() {
		insightsStore.toggleStudent(student.id);
	}

	const riskColors = {
		low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
		medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
		high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
	};

	const riskLabels = {
		low: 'Bajo',
		medium: 'Medio',
		high: 'Alto'
	};

	const statusColors = {
		not_started: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
		in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
	};

	const statusLabels = {
		not_started: 'Sin iniciar',
		in_progress: 'En progreso',
		completed: 'Completado'
	};

	function getLastActivityText(): string {
		if (!student.metrics.lastActivityAt) return 'Sin actividad';
		try {
			return formatDistanceToNow(new Date(student.metrics.lastActivityAt), {
				addSuffix: true,
				locale: es
			});
		} catch {
			return 'Fecha desconocida';
		}
	}
</script>

<!-- Tarjeta seleccionable: una etiqueta con un checkbox real, sin controles anidados en un botón -->
<label
	class="block w-full cursor-pointer rounded-xl border-2 p-4 text-left transition-all duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500
        {isSelected
		? 'border-blue-500 bg-blue-50 shadow-md dark:bg-blue-900/20'
		: 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'}"
>
	<span class="flex items-start gap-3">
		<span class="pt-1">
			<input
				type="checkbox"
				checked={isSelected}
				onchange={toggleSelection}
				class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
			/>
		</span>

		<!-- Content (solo contenido de frase dentro de <label>) -->
		<span class="block min-w-0 flex-1">
			<!-- Header -->
			<span class="mb-2 flex items-center gap-2">
				<span class="truncate font-semibold text-gray-900 dark:text-white">
					{student.alias || student.username}
				</span>
				<span
					class="rounded-full px-2 py-0.5 text-xs font-medium {riskColors[
						student.metrics.riskLevel
					]}"
				>
					Riesgo: {riskLabels[student.metrics.riskLevel]}
				</span>
			</span>

			<!-- Email -->
			<span class="mb-2 block truncate text-sm text-gray-500 dark:text-gray-400">
				{student.email}
			</span>

			<!-- Metrics -->
			<span class="flex flex-wrap items-center gap-2 text-xs">
				<span class="rounded-md px-2 py-1 {statusColors[student.metrics.completionStatus]}">
					{statusLabels[student.metrics.completionStatus]}
				</span>
				<span class="text-gray-500 dark:text-gray-400">
					{student.metrics.totalMessages} msgs
				</span>
				{#if student.metrics.engagementScore !== undefined}
					<span class="text-gray-500 dark:text-gray-400">
						Engagement: {student.metrics.engagementScore}%
					</span>
				{/if}
			</span>

			<!-- Last Activity -->
			<span class="mt-2 block text-xs text-gray-400 dark:text-gray-500">
				{getLastActivityText()}
			</span>
		</span>

		<!-- Engagement Score Circle (decorativo: el valor ya se lee en las métricas) -->
		{#if student.metrics.engagementScore !== undefined}
			<span class="relative h-12 w-12 flex-shrink-0" aria-hidden="true">
				<svg class="h-12 w-12 -rotate-90 transform" viewBox="0 0 36 36">
					<circle
						cx="18"
						cy="18"
						r="15.5"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						class="text-gray-200 dark:text-gray-700"
					/>
					<circle
						cx="18"
						cy="18"
						r="15.5"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-dasharray="{student.metrics.engagementScore * 0.97} 97"
						class={student.metrics.engagementScore >= 70
							? 'text-green-500'
							: student.metrics.engagementScore >= 40
								? 'text-yellow-500'
								: 'text-red-500'}
					/>
				</svg>
				<span
					class="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-300"
				>
					{student.metrics.engagementScore}
				</span>
			</span>
		{/if}
	</span>
</label>
