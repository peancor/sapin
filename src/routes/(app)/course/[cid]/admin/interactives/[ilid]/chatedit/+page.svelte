<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowLeft } from 'lucide-svelte';
	import { Toast } from 'flowbite-svelte';
	import RagSection from '$lib/components/RagSection.svelte';
	import ChatConfigForm from '$lib/components/ChatConfigForm.svelte';
	import InteractiveFilesSection from '$lib/components/InteractiveFilesSection.svelte';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data }: { data: PageData } = $props();
	const { cid, ilid } = page.params;

	let llmRole = $state('');
	let llmInstructions = $state('');
	let llmModel = $state('');
	let temperature = $state(0.7);
	let maxTokens = $state(2000);
	let topP = $state(0.9);
	let name = $state('');
	let description = $state('');
	let status = $state<'hidden' | 'published' | 'closed' | 'archived'>('hidden');
	let llmContext = $state('');
	let systemPrompt = $state('');

	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');
	let isDirty = $state(false);

	$effect(() => {
		if (isDirty) return;

		llmRole = data.chat?.llmRole ?? '';
		llmInstructions = data.chat?.llmInstructions ?? '';
		llmModel = data.chat?.llmModel ?? data.defaultModel ?? '';
		temperature = data.chat?.temperature ?? 0.7;
		maxTokens = data.chat?.maxTokens ?? 2000;
		topP = data.chat?.topP ?? 0.9;
		name = data.interactive?.name ?? '';
		description = data.interactive?.description ?? '';
		status = data.interactive?.status ?? 'hidden';
		llmContext = data.chat?.llmContext ?? '';
		systemPrompt = data.chat?.systemPrompt ?? '';
	});

	function markDirty() {
		isDirty = true;
	}

	onMount(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (isDirty) {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	beforeNavigate((navigation) => {
		if (isDirty && !window.confirm('Hay cambios sin guardar. ¿Deseas salir de todas formas?')) {
			navigation.cancel();
		}
	});

	const handleEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
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
		};
	};
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="sticky top-0 z-10 bg-white shadow-sm dark:bg-gray-800">
		<div class="container mx-auto max-w-screen-xl px-4">
			<div class="flex items-center gap-4 py-4">
				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}`)}
					class="-ml-2 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
					title="Volver a la actividad"
				>
					<ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
				</a>
				<div class="min-w-0 flex-1">
					<h1 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
						Editar: {data.interactive.name}
					</h1>
				</div>
			</div>
		</div>
	</div>

	<div class="container mx-auto max-w-screen-xl px-4 py-6">
		<form
			method="POST"
			action="?/updateChat"
			use:enhance={handleEnhance}
			class="space-y-6 rounded-lg bg-white p-6 shadow dark:bg-gray-800"
		>
			<ChatConfigForm
				bind:name
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
				showNameField={true}
				onchange={markDirty}
			/>

			<div class="flex justify-end">
				<button type="submit" class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
					Guardar cambios
				</button>
			</div>
		</form>

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

		<InteractiveFilesSection
			files={data.files ?? []}
			title="Recursos de la actividad (imágenes y documentos)"
			description="Sube imágenes para mostrarlas durante la actividad y documentos para enlazarlos desde las instrucciones."
			warningMessage="Importante: el modelo de IA no tiene acceso directo al contenido interno de estas imágenes o documentos. Estos recursos se usan para mostrarse al estudiante o para enlazarse desde las instrucciones de la actividad."
			copyHint='En imágenes usa "Copiar nombre" para que la tool pueda localizar el recurso.'
			emptyMessage="Aún no hay recursos. Sube imágenes o documentos para reutilizarlos en la actividad."
		/>
	</div>
</div>

{#if showToast}
	<div class="fixed bottom-4 right-4 z-50">
		<Toast color={toastType === 'success' ? 'green' : 'red'}>
			{toastMessage}
		</Toast>
	</div>
{/if}
