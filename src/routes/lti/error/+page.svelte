<script lang="ts">
	import { resolve } from '$app/paths';
	import { AlertTriangle } from 'lucide-svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Error LTI - Sapin</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
	<section class="w-full space-y-5 rounded-lg border border-red-200 bg-white p-6 shadow-sm">
		<div class="flex items-center gap-3 text-red-700">
			<AlertTriangle class="h-6 w-6" aria-hidden="true" />
			<h1 class="text-xl font-semibold">No se pudo abrir la actividad LTI</h1>
		</div>
		<p class="text-sm leading-6 text-gray-700">{data.message}</p>
		<a
			class="inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
			href={resolve('/login')}
		>
			Iniciar sesión
		</a>
	</section>
</main>
