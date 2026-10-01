<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft } from 'lucide-svelte';

	let {
		courseId,
		interactiveId,
		title,
		subtitle
	}: {
		courseId: string;
		interactiveId: string;
		title: string;
		subtitle: string;
	} = $props();
</script>

<div class="sticky top-0 z-10 bg-white shadow-sm dark:bg-gray-800">
	<div class="container mx-auto max-w-screen-xl px-4">
		<div class="flex items-center gap-4 py-4">
			<a
				href={resolve(`/course/${courseId}/admin/interactives/${interactiveId}`)}
				class="-ml-2 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
				title="Volver a la actividad"
			>
				<ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
			</a>
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
				<p class="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
			</div>
		</div>
	</div>
</div>
