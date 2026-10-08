<script lang="ts">
	import { Checkbox } from 'flowbite-svelte';
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

<button
	class="w-full rounded-xl border-2 p-4 text-left transition-all duration-200
        {isSelected
		? 'border-blue-500 bg-blue-50 shadow-md dark:bg-blue-900/20'
		: 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'}"
	onclick={toggleSelection}
>
	<div class="flex items-start gap-3">
		<!-- Checkbox -->
		<div class="pt-1">
			<Checkbox checked={isSelected} class="pointer-events-none" />
		</div>

		<!-- Content -->
		<div class="min-w-0 flex-1">
			<!-- Header -->
			<div class="mb-2 flex items-center gap-2">
				<h4 class="truncate font-semibold text-gray-900 dark:text-white">
					{student.alias || student.username}
				</h4>
				<span
					class="rounded-full px-2 py-0.5 text-xs font-medium {riskColors[
						student.metrics.riskLevel
					]}"
				>
					{riskLabels[student.metrics.riskLevel]}
				</span>
			</div>

			<!-- Email -->
			<p class="mb-2 truncate text-sm text-gray-500 dark:text-gray-400">
				{student.email}
			</p>

			<!-- Metrics -->
			<div class="flex flex-wrap items-center gap-2 text-xs">
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
			</div>

			<!-- Last Activity -->
			<p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
				{getLastActivityText()}
			</p>
		</div>

		<!-- Engagement Score Circle -->
		{#if student.metrics.engagementScore !== undefined}
			<div class="relative h-12 w-12 flex-shrink-0">
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
			</div>
		{/if}
	</div>
</button>
