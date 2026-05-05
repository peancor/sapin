<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Bot, CheckCircle2, Sparkles } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let showSuccess = $state(false);

	onMount(() => {
		const successTimer = window.setTimeout(() => {
			showSuccess = true;
		}, 500);

		const redirectTimer = window.setTimeout(() => {
			goto(`/agent-chat/${data.activityId}/c/${data.chatId}`, { invalidateAll: true });
		}, 2000);

		return () => {
			window.clearTimeout(successTimer);
			window.clearTimeout(redirectTimer);
		};
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-linear-to-br from-emerald-50 via-cyan-50 to-sky-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
	<div class="pointer-events-none absolute inset-0 overflow-hidden">
		<div class="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl animate-pulse dark:bg-emerald-500/5"></div>
		<div class="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl animate-pulse dark:bg-cyan-500/5" style="animation-delay: 1s;"></div>
		<div class="absolute top-1/2 right-1/3 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl animate-pulse dark:bg-sky-500/5" style="animation-delay: 0.5s;"></div>
	</div>

	<div class="relative z-10 mx-4 w-full max-w-md">
		<div class="relative overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-2xl backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-800/80">
			<div class="relative flex h-32 items-center justify-center overflow-hidden bg-linear-to-r from-emerald-500 via-cyan-500 to-sky-500">
				<div class="absolute inset-0 opacity-30">
					<Sparkles class="absolute top-4 left-8 h-6 w-6 animate-pulse text-white" />
					<Sparkles class="absolute right-12 bottom-6 h-4 w-4 animate-pulse text-white" style="animation-delay: 0.3s;" />
					<Sparkles class="absolute top-8 right-8 h-5 w-5 animate-pulse text-white" style="animation-delay: 0.6s;" />
				</div>
				<div class="relative">
					<div class="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30 backdrop-blur-sm">
						{#if showSuccess}
							<CheckCircle2 class="animate-bounce-in h-10 w-10 text-white" />
						{:else}
							<Bot class="h-10 w-10 animate-pulse text-white" />
						{/if}
					</div>
				</div>
			</div>

			<div class="space-y-6 p-8 text-center">
				<div>
					<h2 class="mb-2 text-2xl font-bold text-gray-800 dark:text-white">
						{#if showSuccess}
							¡Acceso verificado!
						{:else}
							Verificando acceso...
						{/if}
					</h2>
					<p class="text-gray-600 dark:text-gray-300">
						{#if showSuccess}
							Preparando tu sesión con el agente
						{:else}
							Comprobando tus credenciales
						{/if}
					</p>
				</div>

				<div class="relative">
					<div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
						<div class="animate-progress h-full rounded-full bg-linear-to-r from-emerald-500 via-cyan-500 to-sky-500"></div>
					</div>
				</div>

				<div class="flex items-center justify-center gap-3">
					<div class="flex items-center gap-2 text-sm">
						<div class="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
						<span class="text-gray-600 dark:text-gray-300">Redirigiendo al agente...</span>
					</div>
				</div>
			</div>
		</div>

		<p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
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
