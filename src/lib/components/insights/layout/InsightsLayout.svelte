<script lang="ts">
    import type { Snippet } from 'svelte';
    import InsightsTabs from './InsightsTabs.svelte';
    import { ArrowLeft } from 'lucide-svelte';
    import type { InsightsView } from '$lib/types/insights';

    interface Props {
        activityName: string;
        courseId: string;
        ilid: string;
        activeView: InsightsView;
        hasReport: boolean;
        studentsAtRiskCount: number;
        isGenerating?: boolean;
        children: Snippet;
    }

    let {
        activityName,
        courseId,
        ilid,
        activeView,
        hasReport,
        studentsAtRiskCount,
        isGenerating = false,
        children
    }: Props = $props();
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Sticky Header with Tabs -->
    <div class="sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm">
        <div class="container mx-auto px-4 max-w-screen-xl">
            <!-- Header Row -->
            <div class="flex items-center gap-4 py-4">
                <a
                    href="/course/{courseId}/admin/interactives/{ilid}"
                    class="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Volver a la actividad"
                >
                    <ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
                </a>
                <div class="min-w-0 flex-1">
                    <h1 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
                        Insights: {activityName}
                    </h1>
                </div>
            </div>

            <!-- Tabs -->
            <InsightsTabs {activeView} {hasReport} {studentsAtRiskCount} {isGenerating} />
        </div>
    </div>

    <!-- Content Area -->
    <div class="container mx-auto px-4 py-6 max-w-screen-xl">
        {@render children()}
    </div>
</div>
