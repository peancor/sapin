<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { base } from '$app/paths';

    let { data }: { data: PageData } = $props();

    let isStarting = $state(false);

    async function startNewChat() {
        isStarting = true;
        try {
            const response = await fetch(`/api/agent-chat/${data.interactiveLearning.id}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (response.ok) {
                const { chatId } = (await response.json()) as { chatId: string };
                goto(`${base}/agent-chat/${data.interactiveLearning.id}/c/${chatId}`);
            } else {
                console.error('Error al crear el chat agéntico');
            }
        } catch (e) {
            console.error('Error al iniciar el agente:', e);
        } finally {
            isStarting = false;
        }
    }
</script>

<div class="mx-auto max-w-2xl py-8 px-4">
    <!-- Cabecera de la actividad -->
    <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {data.interactiveLearning.name}
        </h1>
        {#if data.interactiveLearning.description}
            <p class="mt-2 text-gray-500 dark:text-gray-400">
                {data.interactiveLearning.description}
            </p>
        {/if}
    </div>

    <!-- Botón de iniciar nuevo chat -->
    <div class="mb-8 flex justify-center">
        <button
            onclick={startNewChat}
            disabled={isStarting}
            class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold
                text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
        >
            {#if isStarting}
                <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Iniciando agente...
            {:else}
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                Nueva sesión con el agente
            {/if}
        </button>
    </div>

    <!-- Historial de sesiones anteriores -->
    {#if data.userChats.length > 0}
        <div>
            <h2 class="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Sesiones anteriores
            </h2>
            <div class="space-y-2">
                {#each data.userChats as chatSession}
                    {#if chatSession}
                        <a
                            href="{base}/agent-chat/{data.interactiveLearning.id}/c/{chatSession.id}"
                            class="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700
                                bg-white dark:bg-gray-800 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-600
                                transition-colors group"
                        >
                            <div class="flex items-center gap-3">
                                <svg class="h-4 w-4 text-gray-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                                </svg>
                                <span class="text-sm text-gray-700 dark:text-gray-300">
                                    Sesión del {new Date(chatSession.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                            <svg class="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                            </svg>
                        </a>
                    {/if}
                {/each}
            </div>
        </div>
    {/if}
</div>
