<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { page } from '$app/stores';
	import { CheckCircle2, Route, Upload, Trash2 } from 'lucide-svelte';
	import LessonBuilder from '$lib/components/lesson/LessonBuilder.svelte';

	let { data }: { data: PageData } = $props();

	let name = $state(data.activity.name);
	let description = $state(data.activity.description ?? '');
	let status = $state(data.activity.status);
	let isDirty = $state(false);
	let uploadFile = $state<File | null>(null);
	let saved = $state(false);

	function markDirty() {
		isDirty = true;
		saved = false;
	}

	breadcrumb.set([
		{ label: 'Inicio', href: '/' },
		{ label: 'Cursos', href: '/course' },
		{ label: 'Curso', href: `/course/${$page.params.cid}` },
		{ label: 'Interactivos', href: `/course/${$page.params.cid}/admin/interactives` },
		{ label: data.activity.name, href: `/course/${$page.params.cid}/admin/interactives/${$page.params.ilid}` },
		{ label: 'Editor lesson' }
	]);
</script>

<div class="space-y-6">
	<div class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900/40">
		<div class="mb-4 flex items-center gap-3">
			<div class="rounded-xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
				<Route class="h-5 w-5" />
			</div>
			<div>
				<h1 class="text-xl font-semibold text-gray-900 dark:text-white">Editor de Lección viva</h1>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Configura bloques secuenciales, branching y pasos con IA.
				</p>
			</div>
		</div>

		<form
			method="POST"
			action="?/updateLesson"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						await update();
						isDirty = false;
						saved = true;
					}
				};
			}}
			class="space-y-6"
		>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="block">
					<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</span>
					<input
						class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
						name="name"
						bind:value={name}
						oninput={markDirty}
					/>
				</label>
				<label class="block">
					<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Estado</span>
					<select
						class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
						name="status"
						bind:value={status}
						onchange={markDirty}
					>
						<option value="hidden">Oculta</option>
						<option value="published">Publicada</option>
						<option value="closed">Cerrada</option>
						<option value="archived">Archivada</option>
					</select>
				</label>
			</div>

			<label class="block">
				<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Descripción</span>
				<textarea
					class="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
					name="description"
					bind:value={description}
					oninput={markDirty}
				></textarea>
			</label>

			<LessonBuilder
				definition={data.definition}
				files={data.files}
				sessionPolicy={data.lessonConfig.sessionPolicy}
				allowRestart={data.lessonConfig.allowRestart}
				onchange={markDirty}
			/>

			<div class="flex items-center justify-between">
				{#if saved}
					<div class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
						<CheckCircle2 class="h-4 w-4" />
						Cambios guardados correctamente
					</div>
				{:else if isDirty}
					<p class="text-sm text-amber-600 dark:text-amber-400">Hay cambios sin guardar</p>
				{:else}
					<div></div>
				{/if}
				<button class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
					Guardar lesson
				</button>
			</div>
		</form>
	</div>

	<div class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900/40">
		<div class="mb-4">
			<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Recursos de la lesson</h2>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Sube imágenes o documentos para reutilizarlos en bloques de contenido.
			</p>
		</div>

		<form method="POST" action="?/uploadFile" enctype="multipart/form-data" class="mb-4 flex flex-wrap items-center gap-3">
			<input
				type="file"
				name="file"
				onchange={(event) => {
					const target = event.currentTarget as HTMLInputElement;
					uploadFile = target.files?.[0] ?? null;
				}}
				class="text-sm"
			/>
			<button class="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">
				<Upload class="mr-1 inline h-4 w-4" />
				Subir recurso
			</button>
			{#if uploadFile}
				<span class="text-sm text-gray-500 dark:text-gray-400">{uploadFile.name}</span>
			{/if}
		</form>

		<div class="space-y-3">
			{#if data.files.length === 0}
				<p class="text-sm text-gray-500 dark:text-gray-400">Todavía no hay recursos subidos.</p>
			{:else}
				{#each data.files as file (file.id)}
					<div class="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
						<div>
							<p class="font-medium text-gray-900 dark:text-white">{file.name}</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">{file.mimeType}</p>
						</div>
						<form method="POST" action="?/deleteFile">
							<input type="hidden" name="fileId" value={file.id} />
							<button class="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600">
								<Trash2 class="mr-1 inline h-4 w-4" />
								Eliminar
							</button>
						</form>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
