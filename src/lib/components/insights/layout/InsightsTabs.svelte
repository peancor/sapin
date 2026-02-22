<script lang="ts">
    import { BarChart3, FileText, Settings, Users, AlertTriangle } from 'lucide-svelte';
    import type { InsightsView } from '$lib/types/insights';
    import { insightsStore } from '$lib/stores/insights';

    interface Props {
        activeView: InsightsView;
        hasReport: boolean;
        studentsAtRiskCount: number;
        isGenerating?: boolean;
    }

    let { activeView, hasReport, studentsAtRiskCount, isGenerating = false }: Props = $props();

    const tabs: { id: InsightsView; label: string; icon: typeof BarChart3; showBadge?: boolean }[] = [
        { id: 'overview', label: 'Resumen', icon: BarChart3 },
        { id: 'students', label: 'Estudiantes', icon: Users },
        { id: 'generate', label: 'Generar', icon: Settings },
        { id: 'report', label: 'Informe', icon: FileText },
        { id: 'alerts', label: 'Alertas', icon: AlertTriangle, showBadge: true }
    ];

    function handleTabClick(tabId: InsightsView) {
        if (tabId === 'report' && !hasReport) return;
        if (tabId === 'streaming') return;
        insightsStore.setActiveView(tabId);
    }

    function isTabDisabled(tabId: InsightsView): boolean {
        return tabId === 'report' && !hasReport;
    }

    function isTabActive(tabId: InsightsView): boolean {
        if (activeView === 'streaming' && tabId === 'generate') return true;
        return activeView === tabId;
    }
</script>

<div class="border-b border-gray-200 dark:border-gray-700">
    <nav class="flex gap-1 overflow-x-auto scrollbar-hide px-1 -mb-px" aria-label="Tabs">
        {#each tabs as tab}
            <button
                onclick={() => handleTabClick(tab.id)}
                disabled={isTabDisabled(tab.id)}
                class="group relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-200
                    {isTabActive(tab.id)
                        ? 'text-blue-600 dark:text-blue-400'
                        : isTabDisabled(tab.id)
                            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
            >
                <!-- Icon -->
                <svelte:component
                    this={tab.icon}
                    size={18}
                    class="{isTabActive(tab.id) ? 'text-blue-600 dark:text-blue-400' : ''} transition-colors"
                />

                <!-- Label -->
                <span>{tab.label}</span>

                <!-- Badge for alerts -->
                {#if tab.showBadge && studentsAtRiskCount > 0}
                    <span class="ml-1 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400">
                        {studentsAtRiskCount}
                    </span>
                {/if}

                <!-- Generating indicator -->
                {#if tab.id === 'generate' && isGenerating}
                    <span class="ml-1 flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                {/if}

                <!-- Active indicator line -->
                <span
                    class="absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-200
                        {isTabActive(tab.id)
                            ? 'bg-blue-600 dark:bg-blue-400'
                            : 'bg-transparent group-hover:bg-gray-200 dark:group-hover:bg-gray-700'}"
                ></span>
            </button>
        {/each}
    </nav>
</div>

<style>
    .scrollbar-hide {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
</style>
