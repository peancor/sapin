<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { BookOpenText, Play, RotateCcw, Route } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
	let isStarting = $state(false);
	let startError = $state('');
	const isPreviewMode = $derived(data.previewMode !== null);
	const runtimeValidationError = $derived(data.runtimeValidationError ?? null);
	const startLabel = $derived.by(() => {
		if (data.previewMode === 'draft') {
			return data.latestSession ? 'Abrir preview borrador' : 'Probar borrador';
		}
		if (data.previewMode === 'published') {
			return data.latestSession ? 'Abrir preview publicado' : 'Probar publicado';
		}
		return data.latestSession ? 'Abrir lesson' : 'Empezar lesson';
	});

	async function startLesson() {
		if (!data.userAccess.courseId) return;
		if (runtimeValidationError) {
			startError = runtimeValidationError.message;
			return;
		}

		isStarting = true;
		startError = '';
		try {
			const endpoint = data.previewMode
				? `/api/lesson/${data.interactiveLearning.id}/preview/session`
				: `/api/lesson/${data.interactiveLearning.id}/session`;
			const payload = data.previewMode
				? { courseId: data.userAccess.courseId, previewMode: data.previewMode }
				: { courseId: data.userAccess.courseId };
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const result = (await response.json().catch(() => ({}))) as {
				error?: string;
				sessionId?: string;
			};
			if (!response.ok) {
				startError = result.error || 'No se pudo preparar la sesión de la lesson.';
				return;
			}
			if (response.ok && result.sessionId) {
				goto(resolve(`/course/${data.userAccess.courseId}/run/lesson/${result.sessionId}`));
				return;
			}
			startError = 'No se pudo preparar la sesión de la lesson.';
		} catch (errorValue) {
			startError =
				errorValue instanceof Error
					? errorValue.message
					: 'No se pudo preparar la sesión de la lesson.';
		} finally {
			isStarting = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl space-y-8 px-4 py-12">
	<div class="rounded-3xl bg-white p-8 shadow-sm dark:bg-gray-900/40">
		<div class="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
			<Route class="h-4 w-4" />
			{#if data.previewMode === 'draft'}
				Preview borrador
			{:else if data.previewMode === 'published'}
				Preview publicado
			{:else}
				Lección viva
			{/if}
		</div>
		<h1 class="text-4xl font-bold text-gray-900 dark:text-white">{data.interactiveLearning.name}</h1>
		{#if data.interactiveLearning.description}
			<p class="mt-3 max-w-2xl text-lg text-gray-600 dark:text-gray-400">{data.interactiveLearning.description}</p>
		{/if}
		{#if isPreviewMode}
			<p class="mt-4 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
				Este recorrido está aislado del alumnado real: no suma progreso ni aparece en review o analítica.
				{#if data.previewMode === 'draft'}
					Estás viendo la revisión borrador #{data.revisionSummary.draft}.
				{:else}
					Estás viendo la revisión publicada #{data.revisionSummary.published}.
				{/if}
			</p>
		{/if}
		{#if runtimeValidationError}
			<div class="mt-4 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
				<p class="font-semibold">El mapa necesita una corrección antes de poder ejecutarse.</p>
				<p class="mt-1">{runtimeValidationError.message}</p>
				{#if data.userAccess.canManage}
					<a
						class="mt-3 inline-flex items-center rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100 dark:hover:bg-rose-950/50"
						href={resolve(`/course/${data.userAccess.courseId}/lesson-studio/${data.interactiveLearning.id}/flow`)}
					>
						Volver al mapa
					</a>
				{/if}
			</div>
		{/if}
		{#if startError && !runtimeValidationError}
			<p class="mt-4 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
				{startError}
			</p>
		{/if}

		<div class="mt-8 flex flex-wrap gap-3">
			<button class="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 font-medium text-white hover:bg-primary-700 disabled:opacity-50" onclick={startLesson} disabled={isStarting || !data.userAccess.courseId || !!runtimeValidationError}>
				<Play class="h-5 w-5" />
				{startLabel}
			</button>
			{#if data.latestSession && data.userAccess.courseId}
				<a class="inline-flex items-center gap-2 rounded-xl border px-6 py-3 font-medium" href={resolve(`/course/${data.userAccess.courseId}/run/lesson/${data.latestSession.id}`)}>
					<RotateCcw class="h-5 w-5" />
					{isPreviewMode ? 'Continuar preview' : `Continuar intento ${data.latestSession.attemptNumber}`}
				</a>
			{/if}
			{#if data.userAccess.canManage}
				<a class="inline-flex items-center gap-2 rounded-xl border px-6 py-3 font-medium" href={resolve(`/lesson/${data.interactiveLearning.id}?preview=published`)}>
					Ver publicado #{data.revisionSummary.published}
				</a>
				<a class="inline-flex items-center gap-2 rounded-xl border px-6 py-3 font-medium" href={resolve(`/lesson/${data.interactiveLearning.id}?preview=draft`)}>
					Ver borrador #{data.revisionSummary.draft}
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
