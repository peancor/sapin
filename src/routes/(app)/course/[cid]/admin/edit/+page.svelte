<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import type { CourseFile, CourseStatusType } from '$lib/server/db/schema';
	import {
		FileText,
		Image,
		Trash2,
		Save,
		Upload,
		FolderOpen,
		CheckCircle,
		AlertCircle,
		Loader2
	} from 'lucide-svelte';
	import { invalidateAll } from '$app/navigation';
	import { Toast, Button } from 'flowbite-svelte';
	import CourseConfigForm from '$lib/components/CourseConfigForm.svelte';

	let { data }: { data: PageData } = $props();

	// Form state - bound to component with proper initialization
	let name = $state('');
	let description = $state('');
	let imageUrl = $state('');
	let status = $state<CourseStatusType>('draft');

	// Initialize state from data
	$effect(() => {
		name = data.course.name;
		description = data.course.description || '';
		imageUrl = data.course.image || '';
		status = data.course.status;
	});

	// UI state
	let isUploading = $state(false);
	let isSaving = $state(false);
	let isDirty = $state(false);
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');

	function markDirty() {
		isDirty = true;
	}

	function showNotification(message: string, type: 'success' | 'error') {
		toastMessage = message;
		toastType = type;
		showToast = true;
		setTimeout(() => (showToast = false), 3000);
	}

	async function handleFileUpload(type: 'document' | 'image') {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = type === 'document' ? '.pdf,.doc,.docx,.txt' : 'image/*';

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			isUploading = true;
			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', type.toUpperCase());

			try {
				const response = await fetch(`?/uploadFile`, {
					method: 'POST',
					body: formData
				});

				if (response.ok) {
					showNotification('Archivo subido correctamente', 'success');
					await invalidateAll();
				} else {
					showNotification('Error al subir el archivo', 'error');
				}
			} catch (error) {
				showNotification('Error al subir el archivo', 'error');
			} finally {
				isUploading = false;
			}
		};

		input.click();
	}

	function getFileIcon(type: string) {
		return type === 'DOCUMENT' ? FileText : Image;
	}
</script>

<div class="mx-auto max-w-4xl">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white">Configuración del curso</h1>
		<p class="mt-2 text-gray-500 dark:text-gray-400">
			Personaliza la información y apariencia de tu curso
		</p>
	</div>

	<form
		method="POST"
		action="?/updatecourse"
		use:enhance={({ formElement, formData, action, cancel, submitter }) => {
			isSaving = true;
			return async ({ result, update }) => {
				isSaving = false;
				if (result.type === 'success') {
					isDirty = false;
					showNotification('Curso actualizado correctamente', 'success');
				} else {
					showNotification('Error al actualizar el curso', 'error');
				}
				invalidateAll();
			};
		}}
		enctype="multipart/form-data"
		class="space-y-8"
	>
		<!-- Course Config Form Component -->
		<CourseConfigForm
			bind:name
			bind:description
			bind:imageUrl
			bind:status
			showStatusSelector={true}
			onchange={markDirty}
		/>

		<!-- Save Button -->
		<div class="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
			<div class="flex items-center gap-2">
				{#if isDirty}
					<div class="h-2 w-2 rounded-full bg-amber-500"></div>
					<span class="text-sm text-gray-500 dark:text-gray-400">Tienes cambios sin guardar</span>
				{:else}
					<CheckCircle class="h-4 w-4 text-green-500" />
					<span class="text-sm text-gray-500 dark:text-gray-400">Todo actualizado</span>
				{/if}
			</div>
			<Button
				type="submit"
				color="blue"
				disabled={isSaving}
				class="gap-2 !rounded-xl !px-6"
			>
				{#if isSaving}
					<Loader2 class="h-4 w-4 animate-spin" />
					Guardando...
				{:else}
					<Save class="h-4 w-4" />
					Guardar cambios
				{/if}
			</Button>
		</div>
	</form>

	<!-- Course Files Section -->
	<div class="mt-10 space-y-6 hidden">
		<div class="flex items-center justify-between">
			<div>
				<h2 class="text-xl font-bold text-gray-900 dark:text-white">Archivos del curso</h2>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Materiales y recursos disponibles para las actividades
				</p>
			</div>
		</div>

		<!-- Upload Buttons -->
		<div class="flex flex-wrap gap-3">
			<Button
				type="button"
				color="alternative"
				class="gap-2 !rounded-xl border-2 border-dashed transition-colors hover:!border-blue-500 hover:!bg-blue-50 dark:hover:!border-blue-400 dark:hover:!bg-blue-900/20"
				onclick={() => handleFileUpload('document')}
				disabled={isUploading}
			>
				{#if isUploading}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<FileText class="h-4 w-4" />
				{/if}
				Subir documento
			</Button>

			<Button
				type="button"
				color="alternative"
				class="gap-2 !rounded-xl border-2 border-dashed transition-colors hover:!border-purple-500 hover:!bg-purple-50 dark:hover:!border-purple-400 dark:hover:!bg-purple-900/20"
				onclick={() => handleFileUpload('image')}
				disabled={isUploading}
			>
				{#if isUploading}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Image class="h-4 w-4" />
				{/if}
				Subir imagen
			</Button>
		</div>

		<!-- Files List -->
		{#if (data.courseFiles ?? []).length > 0}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.courseFiles ?? [] as file (file.id)}
					{@const Icon = getFileIcon(file.type)}
					<div
						class="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
					>
						<div class="flex min-w-0 flex-1 items-center gap-3">
							<div
								class="rounded-lg p-2 {file.type === 'DOCUMENT'
									? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
									: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'}"
							>
								<Icon class="h-5 w-5" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium text-gray-900 dark:text-white">{file.name}</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{file.type === 'DOCUMENT' ? 'Documento' : 'Imagen'}
								</p>
							</div>
						</div>
						<form method="POST" action="?/deleteFile" use:enhance class="flex-shrink-0">
							<input type="hidden" name="fileId" value={file.id} />
							<button
								type="submit"
								class="rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/20"
								title="Eliminar archivo"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</form>
					</div>
				{/each}
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-12 dark:border-gray-700 dark:bg-gray-800/50">
				<div class="rounded-full bg-gray-100 p-4 dark:bg-gray-700">
					<FolderOpen class="h-8 w-8 text-gray-400" />
				</div>
				<p class="mt-4 font-medium text-gray-600 dark:text-gray-300">No hay archivos</p>
				<p class="mt-1 text-sm text-gray-400">Sube documentos o imágenes para el curso</p>
			</div>
		{/if}
	</div>
</div>

<!-- Toast Notification -->
{#if showToast}
	<Toast
		class="fixed bottom-4 right-4 z-50"
		color={toastType === 'success' ? 'green' : 'red'}
		dismissable
	>
		{#snippet icon()}
			{#if toastType === 'success'}
				<CheckCircle class="h-5 w-5" />
			{:else}
				<AlertCircle class="h-5 w-5" />
			{/if}
		{/snippet}
		{toastMessage}
	</Toast>
{/if}
