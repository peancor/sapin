<script lang="ts">
    import type { PageData } from './$types';
    import { base } from '$app/paths';
    import AgentChatComponent from '$lib/components/AgentChatComponent.svelte';

    let { data }: { data: PageData } = $props();

    const apiEndpoint = $derived(`/api/agent-chat/${data.activityId}/chat/${data.chatId}/ask`);
</script>

<div class="flex h-[calc(100vh-4rem)] flex-col">
    <!-- Header compacto -->
    <div class="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <a
            href="{base}/agent-chat/{data.activityId}"
            class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Volver a la actividad"
        >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
        </a>

        <div class="flex-1 min-w-0">
            <h1 class="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {data.interactiveLearning?.name ?? 'Agente'}
            </h1>
            <p class="text-xs text-gray-500 dark:text-gray-400">
                Sesión del {new Date(new Date()).toLocaleDateString('es-ES')}
            </p>
        </div>

        <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-green-500"></span>
            <span class="text-xs text-gray-500">Activo</span>
        </div>
    </div>

    <!-- Componente de chat agéntico -->
    <div class="flex-1 overflow-hidden">
        <AgentChatComponent
            initialMessages={data.messages}
            {apiEndpoint}
            user={data.user}
        />
    </div>
</div>
