<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { LogOut, CheckCircle2, Sparkles } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let showSuccess = $state(false);

	onMount(() => {
		invalidateAll();
		setTimeout(() => {
			showSuccess = true;
		}, 500);
		setTimeout(() => goto('/'), 2000);
	});
</script>

<div class="flex items-center justify-center min-h-screen bg-linear-to-br from-slate-50 via-gray-50 to-zinc-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
	<!-- Elementos decorativos de fondo -->
	<div class="absolute inset-0 overflow-hidden pointer-events-none">
		<div class="absolute top-1/4 left-1/4 w-64 h-64 bg-slate-400/10 dark:bg-slate-500/5 rounded-full blur-3xl animate-pulse"></div>
		<div class="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gray-400/10 dark:bg-gray-500/5 rounded-full blur-3xl animate-pulse" style="animation-delay: 1s;"></div>
		<div class="absolute top-1/2 right-1/3 w-48 h-48 bg-zinc-400/10 dark:bg-zinc-500/5 rounded-full blur-3xl animate-pulse" style="animation-delay: 0.5s;"></div>
	</div>

	<div class="relative z-10 w-full max-w-md mx-4">
		<div class="relative overflow-hidden rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-2xl border border-white/20 dark:border-gray-700/50">
			<!-- Header con gradiente -->
			<div class="relative h-32 bg-linear-to-r from-slate-500 via-gray-500 to-zinc-500 flex items-center justify-center overflow-hidden">
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
							<LogOut class="w-10 h-10 text-white animate-pulse" />
						{/if}
					</div>
				</div>
			</div>

			<!-- Contenido -->
			<div class="p-8 text-center space-y-6">
				<div>
					<h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">
						{#if showSuccess}
							¡Hasta pronto!
						{:else}
							Cerrando sesión...
						{/if}
					</h2>
					<p class="text-gray-600 dark:text-gray-300">
						{data.message}
					</p>
				</div>

				<!-- Barra de progreso animada -->
				<div class="relative">
					<div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
						<div class="h-full bg-linear-to-r from-slate-500 via-gray-500 to-zinc-500 rounded-full animate-progress"></div>
					</div>
				</div>

				<!-- Estado del proceso -->
				<div class="flex items-center justify-center gap-3">
					<div class="flex items-center gap-2 text-sm">
						<div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
						<span class="text-gray-600 dark:text-gray-300">Redirigiendo a inicio...</span>
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