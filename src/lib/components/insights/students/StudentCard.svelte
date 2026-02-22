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
    class="w-full text-left p-4 rounded-xl border-2 transition-all duration-200
        {isSelected
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'}"
    onclick={toggleSelection}
>
    <div class="flex items-start gap-3">
        <!-- Checkbox -->
        <div class="pt-1">
            <Checkbox checked={isSelected} class="pointer-events-none" />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
            <!-- Header -->
            <div class="flex items-center gap-2 mb-2">
                <h4 class="font-semibold text-gray-900 dark:text-white truncate">
                    {student.alias || student.username}
                </h4>
                <span class="px-2 py-0.5 text-xs font-medium rounded-full {riskColors[student.metrics.riskLevel]}">
                    {riskLabels[student.metrics.riskLevel]}
                </span>
            </div>

            <!-- Email -->
            <p class="text-sm text-gray-500 dark:text-gray-400 truncate mb-2">
                {student.email}
            </p>

            <!-- Metrics -->
            <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="px-2 py-1 rounded-md {statusColors[student.metrics.completionStatus]}">
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
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {getLastActivityText()}
            </p>
        </div>

        <!-- Engagement Score Circle -->
        {#if student.metrics.engagementScore !== undefined}
            <div class="relative w-12 h-12 flex-shrink-0">
                <svg class="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
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
                        class="{student.metrics.engagementScore >= 70 ? 'text-green-500' : student.metrics.engagementScore >= 40 ? 'text-yellow-500' : 'text-red-500'}"
                    />
                </svg>
                <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {student.metrics.engagementScore}
                </span>
            </div>
        {/if}
    </div>
</button>
