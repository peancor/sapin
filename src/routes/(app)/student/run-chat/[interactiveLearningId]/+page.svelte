<script lang="ts">
    import type { PageData } from './$types';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { MessageCircle, CheckCircle2, Sparkles } from 'lucide-svelte';

    let { data }: { data: PageData } = $props();

    let showSuccess = $state(false);

    onMount(() => {
        // Mostrar el check de éxito después de un breve momento
        setTimeout(() => {
            showSuccess = true;
        }, 500);

        // Redirigir después de mostrar el mensaje
        setTimeout(() => {
            goto(`/course/${data.courseId}/run/chat/${data.chatId}`, {invalidateAll: true});
        }, 2000);
    });
</script>

<div class="flex items-center justify-center min-h-screen bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
    <!-- Elementos decorativos de fondo -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-400/10 dark:bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div class="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-400/10 dark:bg-purple-500/5 rounded-full blur-3xl animate-pulse" style="animation-delay: 1s;"></div>
        <div class="absolute top-1/2 right-1/3 w-48 h-48 bg-indigo-400/10 dark:bg-indigo-500/5 rounded-full blur-3xl animate-pulse" style="animation-delay: 0.5s;"></div>
    </div>

    <div class="relative z-10 w-full max-w-md mx-4">
        <div class="relative overflow-hidden rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-2xl border border-white/20 dark:border-gray-700/50">
            <!-- Header con gradiente -->
            <div class="relative h-32 bg-linear-to-r from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center overflow-hidden">
                <div class="absolute inset-0 opacity-30">
                    <Sparkles class="absolute top-4 left-8 w-6 h-6 text-white animate-pulse" />
                    <Sparkles class="absolute bottom-6 right-12 w-4 h-4 text-white animate-pulse" style="animation-delay: 0.3s;" />
                    <Sparkles class="absolute top-8 right-8 w-5 h-5 text-white animate-pulse" style="animation-delay: 0.6s;" />
                </div>
                <div class="relative">
                    <div class="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center ring-4 ring-white/30">
                        {#if showSuccess}
                            <CheckCircle2 class="w-10 h-10 text-white animate-bounce-in" />
                        {:else}
                            <MessageCircle class="w-10 h-10 text-white animate-pulse" />
                        {/if}
                    </div>
                </div>
            </div>

            <!-- Contenido -->
            <div class="p-8 text-center space-y-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                        {#if showSuccess}
                            ¡Acceso verificado!
                        {:else}
                            Verificando acceso...
                        {/if}
                    </h2>
                    <p class="text-gray-600 dark:text-gray-300">
                        {#if showSuccess}
                            Preparando tu sesión de chat interactivo
                        {:else}
                            Comprobando tus credenciales
                        {/if}
                    </p>
                </div>

                <!-- Barra de progreso animada -->
                <div class="relative">
                    <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full bg-linear-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full animate-progress"></div>
                    </div>
                </div>

                <!-- Estado del proceso -->
                <div class="flex items-center justify-center gap-3">
                    <div class="flex items-center gap-2 text-sm">
                        <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span class="text-gray-600 dark:text-gray-300">Redirigiendo al chat...</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Texto inferior -->
        <p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Serás redirigido automáticamente
        </p>
    </div>
</div>

<style>
    @keyframes progress {
        0% {
            width: 0%;
        }
        100% {
            width: 100%;
        }
    }

    .animate-progress {
        animation: progress 2s ease-out forwards;
    }

    @keyframes bounce-in {
        0% {
            transform: scale(0);
            opacity: 0;
        }
        50% {
            transform: scale(1.2);
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }

    :global(.animate-bounce-in) {
        animation: bounce-in 0.5s ease-out forwards;
    }
</style>