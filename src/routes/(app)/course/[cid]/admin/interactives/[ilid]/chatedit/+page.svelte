<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import { page } from '$app/state';
	import {
		FileText,
		Image,
		Upload,
		File,
		X,
		Paperclip,
		ArrowLeft,
		Copy,
		Check,
		ExternalLink,
		TriangleAlert
	} from 'lucide-svelte';
	import { invalidateAll } from '$app/navigation';
	import { Toast } from 'flowbite-svelte';
	import RagSection from '$lib/components/RagSection.svelte';
	import ChatConfigForm from '$lib/components/ChatConfigForm.svelte';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';

	let isDragging = $state(false);

	let { data }: { data: PageData } = $props();

	let llmRole = $state('');
	let llmInstructions = $state('');
	let llmModel = $state('');
	let temperature = $state(0.7);
	let maxTokens = $state(2000);
	let topP = $state(0.9);
	let description = $state('');
	let isUploading = $state(false);
	let status = $state<'hidden' | 'published' | 'closed' | 'archived'>('hidden');
	let llmContext = $state('');
	let systemPrompt = $state('');

	//toast
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');
	let isDirty = $state(false);
	let copiedFileId = $state<string | null>(null);

	// Nota: Con reset:false en enhance, los valores del formulario se mantienen
	// después de guardar, por lo que no necesitamos sincronización manual desde data
	$effect(() => {
		if (isDirty) return;

		llmRole = data.chat?.llmRole ?? '';
		llmInstructions = data.chat?.llmInstructions ?? '';
		llmModel = data.chat?.llmModel ?? data.defaultModel ?? '';
		temperature = data.chat?.temperature ?? 0.7;
		maxTokens = data.chat?.maxTokens ?? 2000;
		topP = data.chat?.topP ?? 0.9;
		description = data.interactive?.description ?? '';
		status = data.interactive?.status ?? 'hidden';
		llmContext = data.chat?.llmContext ?? '';
		systemPrompt = data.chat?.systemPrompt ?? '';
	});

	async function handleFileUpload(type: 'document' | 'image') {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = type === 'document' ? '.pdf,.doc,.docx,.txt' : 'image/*';
		input.multiple = true;

		input.onchange = async (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (!files || files.length === 0) return;

			isUploading = true;

			for (const file of files) {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('type', type.toUpperCase());

				try {
					await fetch(`?/uploadFile`, {
						method: 'POST',
						body: formData
					});
				} catch (error) {
					console.error('Error uploading file:', error);
				}
			}

			await invalidateAll();
			isUploading = false;
		};

		input.click();
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		isUploading = true;

		for (const file of files) {
			const type = file.type.startsWith('image/') ? 'IMAGE' : 'DOCUMENT';
			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', type);

			try {
				await fetch(`?/uploadFile`, {
					method: 'POST',
					body: formData
				});
			} catch (error) {
				console.error('Error uploading file:', error);
			}
		}

		await invalidateAll();
		isUploading = false;
	}

	function getFileIcon(type: string) {
		return type === 'IMAGE' ? Image : FileText;
	}

	function formatFileSize(bytes: number | null | undefined): string {
		if (!bytes) return '';
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function getFileUrl(file: { id: string; path?: string | null }): string {
		return file.path || `/api/files/${file.id}`;
	}

	async function copyFileUrl(file: { id: string; path?: string | null }) {
		const absoluteUrl = `${window.location.origin}${getFileUrl(file)}`;

		try {
			await navigator.clipboard.writeText(absoluteUrl);
		} catch {
			const textarea = document.createElement('textarea');
			textarea.value = absoluteUrl;
			textarea.setAttribute('readonly', '');
			textarea.style.position = 'absolute';
			textarea.style.left = '-9999px';
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
		}

		copiedFileId = file.id;
		showToast = true;
		toastMessage = 'Enlace copiado al portapapeles';
		toastType = 'success';
		setTimeout(() => {
			copiedFileId = null;
			showToast = false;
		}, 2000);
	}

	function markDirty() {
		isDirty = true;
	}

	function confirmDeleteFile(event: SubmitEvent, fileName: string) {
		const ok = window.confirm(
			`Vas a eliminar "${fileName}". Esta acción también eliminará el archivo del sistema y no se puede deshacer.`
		);
		if (!ok) {
			event.preventDefault();
		}
	}

	onMount(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (isDirty) {
				e.preventDefault();
				e.returnValue = '';
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	beforeNavigate((navigation) => {
		if (isDirty && !window.confirm('Hay cambios sin guardar. ¿Deseas salir de todas formas?')) {
			navigation.cancel();
		}
	});

	const handleEnhance: SubmitFunction = ({ formElement, formData, action, cancel, submitter }) => {
		return async ({ result, update }) => {
			// Pasamos { reset: false } para NO resetear el formulario tras el envío
			// Esto mantiene los valores actuales mientras SvelteKit actualiza data
			await update({ reset: false });

			if (result.type === 'success') {
				isDirty = false;
				showToast = true;
				toastMessage = 'Actividad actualizada correctamente';
				toastType = 'success';
			} else {
				showToast = true;
				toastMessage = 'Error al actualizar la actividad';
				toastType = 'error';
			}
			setTimeout(() => (showToast = false), 3000);
			//invalidateAll();
		};
	};
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header with back arrow -->
	<div class="sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm">
		<div class="container mx-auto px-4 max-w-screen-xl">
			<div class="flex items-center gap-4 py-4">
				<a
					href="/course/{page.params.cid}/admin/interactives/{page.params.ilid}"
					class="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					title="Volver a la actividad"
				>
					<ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
				</a>
				<div class="min-w-0 flex-1">
					<h1 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
						Editar: {data.interactive.name}
					</h1>
				</div>
			</div>
		</div>
	</div>

	<!-- Content Area -->
	<div class="container mx-auto px-4 py-6 max-w-screen-xl">

	<form
		method="POST"
		action="?/updateChat"
		use:enhance={handleEnhance}
		class="space-y-6 rounded-lg bg-white p-6 shadow dark:bg-gray-800"
	>
		<ChatConfigForm
			bind:llmRole
			bind:llmInstructions
			bind:llmModel
			bind:temperature
			bind:maxTokens
			bind:topP
			bind:description
			bind:systemPrompt
			bind:llmContext
			bind:status
			models={data.models}
			defaultModel={data.defaultModel}
			onchange={markDirty}
		/>

		<div class="flex justify-end">
			<button type="submit" class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
				Guardar cambios
			</button>
		</div>
	</form>

	<!-- RAG Section -->
	<div class="mt-6">
		<RagSection
			ragChunkSize={data.ragConfig?.chunkSize ?? 6000}
			ragChunkOverlap={data.ragConfig?.chunkOverlap ?? 200}
			ragTopK={data.ragConfig?.topK ?? 5}
			ragMinScore={data.ragConfig?.minScore ?? 0.55}
			ragContextMaxChars={data.ragConfig?.contextMaxChars ?? 18000}
			ragMergeAdjacentChunks={data.ragConfig?.mergeAdjacentChunks ?? true}
			ragAdjacencyWindow={data.ragConfig?.adjacencyWindow ?? 0}
			ragPerSourceMaxBlocks={data.ragConfig?.perSourceMaxBlocks ?? 3}
			ragFallbackMinScore={data.ragConfig?.fallbackMinScore ?? 0.45}
			ragDocuments={data.ragDocuments ?? []}
			ragUploadMaxBytes={data.ragUploadMaxBytes ?? 50 * 1024 * 1024}
			qdrantConnected={data.qdrantStatus?.connected ?? false}
			ragCollectionInfo={data.ragCollectionInfo}
			ragTechnicalInfo={data.ragTechnicalInfo}
		/>
	</div>

	<!-- Attachments Section - Modern Design -->
	<div class="mt-6 overflow-hidden rounded-xl bg-white shadow-lg dark:bg-gray-800 ">
		<div
			class="border-b border-gray-100 bg-linear-to-r from-indigo-50 to-purple-50 px-6 py-4 dark:border-gray-700 dark:from-gray-800 dark:to-gray-800"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30"
				>
					<Paperclip class="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
						Recursos de la actividad (imágenes y documentos)
					</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Sube imágenes para mostrarlas durante la actividad y documentos para enlazarlos desde
						las instrucciones.
					</p>
				</div>
			</div>
		</div>

		<div class="p-6">
			<div
				class="mb-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200"
			>
				<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
				<p>
					Importante: el modelo de IA no tiene acceso directo al contenido interno de estas imágenes o
					documentos. Estos recursos se usan para mostrarse al estudiante o para enlazarse desde las
					instrucciones de la actividad.
				</p>
			</div>

			<!-- Drop Zone -->
			<div
				role="button"
				tabindex="0"
				class="relative mb-6 rounded-xl border-2 border-dashed transition-all duration-200 {isDragging
					? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
					: 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-gray-500 dark:hover:bg-gray-700'}"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				onkeydown={(e) => e.key === 'Enter' && handleFileUpload('document')}
			>
				<div class="flex flex-col items-center justify-center py-10">
					{#if isUploading}
						<div class="flex flex-col items-center gap-3">
							<div
								class="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
							></div>
							<p class="font-medium text-gray-600 dark:text-gray-300">Subiendo archivos...</p>
						</div>
					{:else}
						<div
							class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30"
						>
							<Upload class="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
						</div>
						<p class="mb-2 text-base font-medium text-gray-700 dark:text-gray-200">
							Arrastra y suelta recursos aquí
						</p>
						<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">o selecciona una opción</p>
						<div class="flex flex-wrap justify-center gap-3">
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
								onclick={() => handleFileUpload('document')}
								disabled={isUploading}
							>
								<FileText class="h-4 w-4" />
								Documentos
							</button>
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:shadow focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600"
								onclick={() => handleFileUpload('image')}
								disabled={isUploading}
							>
								<Image class="h-4 w-4" />
								Imágenes
							</button>
						</div>
						<p class="mt-4 text-xs text-gray-400 dark:text-gray-500">
							PDF, DOC, DOCX, TXT, PNG, JPG, GIF
						</p>
					{/if}
				</div>
			</div>

			<!-- Files List -->
			{#if (data.files ?? []).length > 0}
				<div class="space-y-2">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
							{data.files?.length} archivo{data.files?.length === 1 ? '' : 's'}
						</h3>
						<p class="text-xs text-gray-500 dark:text-gray-400">
							Usa "Copiar enlace" para referenciar recursos en las instrucciones.
						</p>
					</div>
					<div class="grid gap-3">
						{#each data.files ?? [] as file (file.id)}
							<div
								class="group flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-500"
							>
								<div class="flex items-center gap-4">
									<div
										class="flex h-12 w-12 items-center justify-center rounded-lg {file.type ===
										'IMAGE'
											? 'bg-pink-100 dark:bg-pink-900/30'
											: 'bg-blue-100 dark:bg-blue-900/30'}"
									>
										{#if file.type === 'IMAGE'}
											<Image class="h-6 w-6 text-pink-600 dark:text-pink-400" />
										{:else}
											<FileText class="h-6 w-6 text-blue-600 dark:text-blue-400" />
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate font-medium text-gray-900 dark:text-white">{file.name}</p>
										<div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
											<span
												class="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase dark:bg-gray-600"
											>
												{file.type === 'IMAGE' ? 'Imagen' : 'Documento'}
											</span>
											{#if file.size}
												<span>{formatFileSize(file.size)}</span>
											{/if}
										</div>
									</div>
								</div>
								<div class="flex items-center gap-2">
									<button
										type="button"
										class="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-medium text-gray-600 ring-1 ring-gray-300 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
										title="Copiar enlace del archivo"
										onclick={() => copyFileUrl(file)}
									>
										{#if copiedFileId === file.id}
											<Check class="h-4 w-4" />
											Copiado
										{:else}
											<Copy class="h-4 w-4" />
											Copiar enlace
										{/if}
									</button>
									<a
										href={getFileUrl(file)}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:ring-indigo-700/40 dark:hover:bg-indigo-900/30"
										title="Ver archivo"
									>
										<ExternalLink class="h-4 w-4" />
										Ver archivo
									</a>
									<form
										method="POST"
										action="?/deleteFile"
										class="opacity-70 transition-opacity group-hover:opacity-100"
										onsubmit={(e) => confirmDeleteFile(e, file.name)}
									>
										<input type="hidden" name="fileId" value={file.id} />
										<button
											type="submit"
											class="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
											title="Eliminar archivo"
										>
											<X class="h-5 w-5" />
										</button>
									</form>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div
					class="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 py-8 dark:border-gray-600"
				>
					<File class="mb-2 h-12 w-12 text-gray-300 dark:text-gray-600" />
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Aún no hay recursos. Sube imágenes o documentos para reutilizarlos en la actividad.
					</p>
				</div>
			{/if}
		</div>
	</div>

	{#if showToast}
		<Toast class="fixed right-4 bottom-4" color={toastType === 'success' ? 'green' : 'red'}>
			{#snippet icon()}
				{#if toastType === 'success'}
					<svg
						class="h-5 w-5"
						fill="currentColor"
						viewBox="0 0 20 20"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						></path>
					</svg>
				{:else}
					<svg
						class="h-5 w-5"
						fill="currentColor"
						viewBox="0 0 20 20"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							fill-rule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clip-rule="evenodd"
						></path>
					</svg>
				{/if}
			{/snippet}
			{toastMessage}
		</Toast>
	{/if}
	</div>
</div>
