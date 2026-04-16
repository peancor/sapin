<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { BookOpenText, Play, RotateCcw, Route } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
	let isStarting = $state(false);

	async function startLesson() {
		if (!data.userAccess.courseId) return;
		isStarting = true;
		try {
			const response = await fetch(`/api/lesson/${data.interactiveLearning.id}/session`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ courseId: data.userAccess.courseId })
			});
			const result = (await response.json().catch(() => ({}))) as { sessionId?: string };
			if (response.ok && result.sessionId) {
				goto(resolve(`/course/${data.userAccess.courseId}/run/lesson/${result.sessionId}`));
			}
		} finally {
			isStarting = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl space-y-8 px-4 py-12">
	<div class="rounded-3xl bg-white p-8 shadow-sm dark:bg-gray-900/40">
		<div class="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
			<Route class="h-4 w-4" />
			Lección viva
		</div>
		<h1 class="text-4xl font-bold text-gray-900 dark:text-white">{data.interactiveLearning.name}</h1>
		{#if data.interactiveLearning.description}
			<p class="mt-3 max-w-2xl text-lg text-gray-600 dark:text-gray-400">{data.interactiveLearning.description}</p>
		{/if}

		<div class="mt-8 flex flex-wrap gap-3">
			<button class="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 font-medium text-white hover:bg-primary-700 disabled:opacity-50" onclick={startLesson} disabled={isStarting || !data.userAccess.courseId}>
				<Play class="h-5 w-5" />
				{data.latestSession ? 'Abrir lesson' : 'Empezar lesson'}
			</button>
			{#if data.latestSession && data.userAccess.courseId}
				<a class="inline-flex items-center gap-2 rounded-xl border px-6 py-3 font-medium" href={resolve(`/course/${data.userAccess.courseId}/run/lesson/${data.latestSession.id}`)}>
					<RotateCcw class="h-5 w-5" />
					Continuar intento {data.latestSession.attemptNumber}
				</a>
			{/if}
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
		<div class="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900/40">
			<h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Vista del flujo</h2>
			<div class="space-y-3">
				{#each data.definition.blocks as block (block.id)}
					<div class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
						<p class="text-xs uppercase tracking-wide text-gray-500">{block.kind}</p>
						<p class="mt-1 font-medium text-gray-900 dark:text-white">{block.title}</p>
						<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
							{block.id === data.definition.entryBlockId ? 'Bloque de entrada' : `ID: ${block.id}`}
						</p>
					</div>
				{/each}
			</div>
		</div>

		<div class="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900/40">
			<div class="flex items-center gap-3">
				<div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
					<BookOpenText class="h-5 w-5" />
				</div>
				<div>
					<h2 class="font-semibold text-gray-900 dark:text-white">Runtime</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						{data.lessonConfig.sessionPolicy === 'always_new_attempt'
							? 'Cada acceso crea un intento nuevo'
							: 'Se reanuda el último intento disponible'}
					</p>
				</div>
			</div>
			<p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
				{data.lessonConfig.allowRestart
					? 'Los estudiantes pueden reiniciar desde la vista de ejecución.'
					: 'El reinicio está desactivado para los estudiantes.'}
			</p>
		</div>
	</div>
</div>
