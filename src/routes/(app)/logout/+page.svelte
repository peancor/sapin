<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';
	import { LogOut, CheckCircle2, Sparkles } from 'lucide-svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Llegada directa por GET con sesión abierta: se pide confirmación mediante POST.
	const needsConfirmation = $derived(!form && data.hasSession);

	let showSuccess = $state(false);

	onMount(() => {
		if (needsConfirmation) return;
		const successTimer = setTimeout(() => {
			showSuccess = true;
		}, 500);
		const redirectTimer = setTimeout(() => goto(resolve('/'), { invalidateAll: true }), 2000);
		return () => {
			clearTimeout(successTimer);
			clearTimeout(redirectTimer);
		};
	});
</script>

<div
	class="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-gray-50 to-zinc-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
>
	<!-- Elementos decorativos de fondo -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden">
		<div
			class="absolute top-1/4 left-1/4 h-64 w-64 animate-pulse rounded-full bg-slate-400/10 blur-3xl dark:bg-slate-500/5"
		></div>
		<div
			class="absolute right-1/4 bottom-1/4 h-80 w-80 animate-pulse rounded-full bg-gray-400/10 blur-3xl dark:bg-gray-500/5"
			style="animation-delay: 1s;"
		></div>
		<div
			class="absolute top-1/2 right-1/3 h-48 w-48 animate-pulse rounded-full bg-zinc-400/10 blur-3xl dark:bg-zinc-500/5"
			style="animation-delay: 0.5s;"
		></div>
	</div>

	<div class="relative z-10 mx-4 w-full max-w-md">
		<div
			class="relative overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-2xl backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-800/80"
		>
			<!-- Header con gradiente -->
			<div
				class="relative flex h-32 items-center justify-center overflow-hidden bg-linear-to-r from-slate-500 via-gray-500 to-zinc-500"
			>
				<div class="absolute inset-0 opacity-30">
					<Sparkles class="absolute top-4 left-8 h-6 w-6 animate-pulse text-white" />
					<Sparkles
						class="absolute right-12 bottom-6 h-4 w-4 animate-pulse text-white"
						style="animation-delay: 0.3s;"
					/>
					<Sparkles
						class="absolute top-8 right-8 h-5 w-5 animate-pulse text-white"
						style="animation-delay: 0.6s;"
					/>
				</div>
				<div class="relative">
					<div
						class="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30 backdrop-blur-sm"
					>
						{#if showSuccess}
							<CheckCircle2 class="animate-bounce-in h-10 w-10 text-white" />
						{:else}
							<LogOut class="h-10 w-10 animate-pulse text-white" />
						{/if}
					</div>
				</div>
			</div>

			<!-- Contenido -->
			<div class="space-y-6 p-8 text-center">
				{#if needsConfirmation}
					<div>
						<h1 class="mb-2 text-2xl font-bold text-gray-800 dark:text-white">¿Cerrar sesión?</h1>
						<p class="text-gray-600 dark:text-gray-300">
							Tu sesión sigue abierta en este navegador.
						</p>
					</div>
					<form method="POST" class="flex items-center justify-center gap-3">
						<a
							href={resolve('/dashboard')}
							class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
						>
							Cancelar
						</a>
						<button
							type="submit"
							class="rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
						>
							Cerrar sesión
						</button>
					</form>
				{:else}
					<div role="status">
						<h1 class="mb-2 text-2xl font-bold text-gray-800 dark:text-white">
							{#if showSuccess}
								¡Hasta pronto!
							{:else}
								Cerrando sesión...
							{/if}
						</h1>
						<p class="text-gray-600 dark:text-gray-300">
							{form?.message ??
								'No hay ninguna sesión abierta. Redirigiendo a la página principal...'}
						</p>
					</div>

					<!-- Barra de progreso animada -->
					<div class="relative">
						<div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
							<div
								class="animate-progress h-full rounded-full bg-linear-to-r from-slate-500 via-gray-500 to-zinc-500"
							></div>
						</div>
					</div>

					<!-- Estado del proceso -->
					<div class="flex items-center justify-center gap-3">
						<div class="flex items-center gap-2 text-sm">
							<div class="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
							<span class="text-gray-600 dark:text-gray-300">Redirigiendo a inicio...</span>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Texto inferior -->
		{#if !needsConfirmation}
			<p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
				Serás redirigido automáticamente
			</p>
		{/if}
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
