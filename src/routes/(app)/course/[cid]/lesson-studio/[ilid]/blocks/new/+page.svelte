<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { page } from '$app/state';
	import { lessonFlowHref } from '$lib/lesson/lessonStudioNavigation';
	import { Route } from 'lucide-svelte';

	const flowHref = $derived(
		lessonFlowHref({
			cid: page.params.cid ?? '',
			ilid: page.params.ilid ?? ''
		})
	);
</script>

<div class="min-h-full p-4 sm:p-6 lg:p-8">
	<div
		class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900/40 dark:ring-gray-800"
	>
		<div class="flex max-w-2xl flex-col gap-4">
			<div
				class="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
			>
				<Route class="h-5 w-5" />
			</div>
			<div>
				<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">
					La creación de bloques vive en el mapa
				</h1>
				<p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
					Abre el editor visual para añadir bloques en su posición natural y conectarlos al flujo.
				</p>
			</div>
			<a
				href={flowHref}
				class="bg-primary-600 hover:bg-primary-700 inline-flex w-fit items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
			>
				<Route class="mr-2 h-4 w-4" />
				Abrir mapa
			</a>
		</div>
	</div>
</div>
