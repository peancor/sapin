<script lang="ts">
    import { Button, Card } from 'flowbite-svelte';
    import StatsGrid from './StatsGrid.svelte';
    import ParticipationDonut from '../charts/ParticipationDonut.svelte';
    import EngagementChart from '../charts/EngagementChart.svelte';
    import { insightsStore } from '$lib/stores/insights';
    import { Settings, AlertTriangle } from 'lucide-svelte';
    import type { ChatSummaryStats, ConsolidatedMetrics, ActivityContext } from '$lib/types/insights';

    interface Props {
        chatStats: ChatSummaryStats;
        metrics: ConsolidatedMetrics | null;
        activityContext: ActivityContext;
    }

    let { chatStats, metrics, activityContext }: Props = $props();

    function goToGenerate() {
        insightsStore.setActiveView('generate');
    }

    function goToAlerts() {
        insightsStore.setActiveView('alerts');
    }
</script>

<div class="space-y-6">
    <!-- Stats Grid -->
    <StatsGrid {chatStats} {metrics} />

    <!-- Charts Row -->
    {#if metrics}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Participation Donut -->
            <Card class="p-4">
                <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    Distribucion de Participacion
                </h3>
                <ParticipationDonut data={metrics.participation} />
            </Card>

            <!-- Quick Alerts Summary -->
            <Card class="p-4">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                        Alertas Tempranas
                    </h3>
                    {#if metrics.earlyWarning.totalAtRisk > 0}
                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            {metrics.earlyWarning.totalAtRisk} en riesgo
                        </span>
                    {/if}
                </div>

                {#if metrics.earlyWarning.totalAtRisk === 0}
                    <div class="flex flex-col items-center justify-center py-8 text-center">
                        <div class="p-4 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                            <svg class="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p class="text-gray-600 dark:text-gray-400">
                            No hay estudiantes en riesgo
                        </p>
                    </div>
                {:else}
                    <div class="space-y-3">
                        <!-- Risk Distribution -->
                        <div class="grid grid-cols-3 gap-2 mb-4">
                            <div class="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                                <p class="text-2xl font-bold text-red-600 dark:text-red-400">
                                    {metrics.earlyWarning.riskDistribution.high}
                                </p>
                                <p class="text-xs text-red-600 dark:text-red-400">Alto</p>
                            </div>
                            <div class="text-center p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                                <p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                                    {metrics.earlyWarning.riskDistribution.medium}
                                </p>
                                <p class="text-xs text-yellow-600 dark:text-yellow-400">Medio</p>
                            </div>
                            <div class="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                                <p class="text-2xl font-bold text-green-600 dark:text-green-400">
                                    {metrics.earlyWarning.riskDistribution.low}
                                </p>
                                <p class="text-xs text-green-600 dark:text-green-400">Bajo</p>
                            </div>
                        </div>

                        <!-- Preview of at-risk students -->
                        <div class="space-y-2 max-h-32 overflow-y-auto">
                            {#each metrics.earlyWarning.studentsAtRisk.slice(0, 3) as student}
                                <div class="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                    <div class="w-2 h-2 rounded-full {student.student.metrics.riskLevel === 'high' ? 'bg-red-500' : 'bg-yellow-500'}"></div>
                                    <span class="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                                        {student.student.username}
                                    </span>
                                    <span class="text-xs text-gray-500 dark:text-gray-400">
                                        {student.riskFactors[0]?.description || ''}
                                    </span>
                                </div>
                            {/each}
                        </div>

                        {#if metrics.earlyWarning.totalAtRisk > 3}
                            <button
                                onclick={goToAlerts}
                                class="w-full text-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Ver todos ({metrics.earlyWarning.totalAtRisk})
                            </button>
                        {/if}
                    </div>
                {/if}
            </Card>
        </div>
    {/if}

    <!-- Activity Details -->
    <Card class="p-4">
        <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Detalles de la Actividad
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre</p>
                <p class="text-gray-900 dark:text-white">{activityContext.name}</p>
            </div>
            <div>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Descripcion</p>
                <p class="text-gray-900 dark:text-white">{activityContext.description || 'N/A'}</p>
            </div>
            <div>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Rol LLM</p>
                <p class="text-gray-900 dark:text-white">{activityContext.llmRole || 'N/A'}</p>
            </div>
            <div>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Instrucciones</p>
                <p class="text-gray-900 dark:text-white line-clamp-2">{activityContext.llmInstructions || 'N/A'}</p>
            </div>
        </div>
    </Card>

    <!-- Action Buttons -->
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <Button color="blue" size="lg" onclick={goToGenerate} class="gap-2">
            <Settings size={18} />
            Generar Informe de Insights
        </Button>
        {#if metrics && metrics.earlyWarning.totalAtRisk > 0}
            <Button color="light" size="lg" onclick={goToAlerts} class="gap-2">
                <AlertTriangle size={18} />
                Ver Alertas ({metrics.earlyWarning.totalAtRisk})
            </Button>
        {/if}
    </div>
</div>
