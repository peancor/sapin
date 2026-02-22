<script lang="ts">
    import { Card } from 'flowbite-svelte';
    import { marked } from 'marked';
    import { streamingPhases } from '$lib/stores/insights';
    import { Check, Loader2, AlertTriangle } from 'lucide-svelte';

    interface Props {
        content: string;
        progress: number;
        currentPhase: number;
    }

    let { content, progress, currentPhase }: Props = $props();

    let phases = $derived($streamingPhases);

    function getPhaseStatus(phase: typeof phases[0]) {
        return phase.status;
    }
</script>

<div class="space-y-6">
    <!-- Header -->
    <div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Generando Informe</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">El analisis esta en proceso. No cierres esta pagina.</p>
    </div>

    <!-- Main Grid: Two columns -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Column: Progress (1/3 width) -->
        <div class="lg:col-span-1 space-y-4">
            <!-- Progress Card -->
            <Card class="p-4">
                <div class="flex items-center justify-between mb-3">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Progreso</span>
                    <span class="text-lg font-bold text-blue-600 dark:text-blue-400">{Math.round(progress)}%</span>
                </div>

                <!-- Progress Bar -->
                <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
                    <div
                        class="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-full transition-all duration-500 relative"
                        style="width: {progress}%"
                    >
                        <div class="absolute inset-0 shimmer-effect"></div>
                    </div>
                </div>

                <!-- Phases List -->
                <div class="space-y-2">
                    {#each phases as phase, index}
                        <div class="flex items-center gap-3 p-2 rounded-lg transition-colors
                            {getPhaseStatus(phase) === 'active' ? 'bg-blue-50 dark:bg-blue-900/20' : ''}">
                            <!-- Status Icon -->
                            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                                {getPhaseStatus(phase) === 'completed'
                                    ? 'bg-green-500 text-white'
                                    : getPhaseStatus(phase) === 'active'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}">
                                {#if getPhaseStatus(phase) === 'completed'}
                                    <Check size={16} />
                                {:else if getPhaseStatus(phase) === 'active'}
                                    <Loader2 size={16} class="animate-spin" />
                                {:else}
                                    <span class="text-sm">{phase.icon}</span>
                                {/if}
                            </div>

                            <!-- Phase Info -->
                            <div class="flex-1 min-w-0">
                                <span class="text-sm font-medium block truncate
                                    {getPhaseStatus(phase) === 'active'
                                        ? 'text-blue-700 dark:text-blue-300'
                                        : getPhaseStatus(phase) === 'completed'
                                            ? 'text-green-700 dark:text-green-400'
                                            : 'text-gray-500 dark:text-gray-400'}">
                                    {phase.name}
                                </span>
                            </div>

                            <!-- Status Badge -->
                            {#if getPhaseStatus(phase) === 'active'}
                                <span class="text-xs text-blue-600 dark:text-blue-400">En curso</span>
                            {:else if getPhaseStatus(phase) === 'completed'}
                                <span class="text-xs text-green-600 dark:text-green-400">Listo</span>
                            {/if}
                        </div>
                    {/each}
                </div>
            </Card>

            <!-- Warning Card -->
            <Card class="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                <div class="flex items-start gap-3">
                    <AlertTriangle size={18} class="text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div class="text-sm">
                        <p class="font-medium text-yellow-800 dark:text-yellow-300">No abandones la pagina</p>
                        <p class="text-yellow-700 dark:text-yellow-400 mt-1">El informe se guardara automaticamente al completarse.</p>
                    </div>
                </div>
            </Card>

            <!-- Stats -->
            <Card class="p-4">
                <div class="grid grid-cols-2 gap-3 text-center">
                    <div>
                        <span class="block text-2xl font-bold text-gray-900 dark:text-white">{content.length}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">caracteres</span>
                    </div>
                    <div>
                        <span class="block text-2xl font-bold text-gray-900 dark:text-white">{content.split('\n').filter(l => l.startsWith('#')).length}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">secciones</span>
                    </div>
                </div>
            </Card>
        </div>

        <!-- Right Column: Content Preview (2/3 width) -->
        <div class="lg:col-span-2">
            <Card class="p-4 h-full">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Vista Previa</h3>
                    {#if currentPhase > 0 && currentPhase <= phases.length}
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            <span>{phases[currentPhase - 1].icon}</span>
                            <span>{phases[currentPhase - 1].name}</span>
                        </span>
                    {/if}
                </div>

                {#if content}
                    <div class="prose dark:prose-invert prose-sm max-w-none overflow-y-auto max-h-[calc(100vh-320px)] pr-2">
                        {@html marked.parse(content)}
                    </div>
                {:else}
                    <div class="flex flex-col items-center justify-center py-16 text-center">
                        <div class="relative mb-4">
                            <div class="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <Loader2 size={32} class="text-blue-500 animate-spin" />
                            </div>
                            <div class="absolute inset-0 rounded-full border-4 border-blue-200 dark:border-blue-800 animate-ping opacity-20"></div>
                        </div>
                        <p class="text-gray-600 dark:text-gray-400 font-medium">Preparando el analisis...</p>
                        <p class="text-sm text-gray-500 dark:text-gray-500 mt-1">El contenido aparecera aqui conforme se genere</p>
                    </div>
                {/if}
            </Card>
        </div>
    </div>
</div>

<style>
    .shimmer-effect {
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
        animation: shimmer 1.5s infinite;
    }

    @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
    }

    :global(.prose h1, .prose h2, .prose h3) {
        margin-top: 1rem;
    }

    :global(.prose h1:first-child, .prose h2:first-child, .prose h3:first-child) {
        margin-top: 0;
    }
</style>
