<script lang="ts">
    import type { PageData } from './$types';
    import { base } from '$app/paths';
    import AgentChatComponent from '$lib/components/agent/AgentChatComponent.svelte';

    let { data }: { data: PageData } = $props();

    const apiEndpoint = $derived(
        `/api/agent-chat/${data.activityId}/chat/${data.chatId}/ask`
    );
</script>

<div class="flex h-[calc(100vh-4rem)] flex-col">
    <!-- Header -->
    <div class="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <a
            href="{base}/dashboard"
            class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Volver al dashboard"
        >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
        </a>

        <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                <svg class="h-4 w-4 text-indigo-600 dark:text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
            </div>
            <div>
                <h1 class="text-sm font-semibold text-gray-900 dark:text-white">Asistente de Tutoría</h1>
                <p class="text-xs text-gray-500 dark:text-gray-400">Tu asistente educativo personal</p>
            </div>
        </div>

        <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-green-500"></span>
            <span class="text-xs text-gray-500">Activo</span>
        </div>
    </div>

    <!-- Chat -->
    <div class="flex-1 overflow-hidden">
        <AgentChatComponent
            initialMessages={data.messages}
            {apiEndpoint}
            user={data.user}
        />
    </div>
</div>
