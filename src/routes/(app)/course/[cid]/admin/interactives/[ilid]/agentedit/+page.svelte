<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowLeft, Bot } from 'lucide-svelte';
	import { Toast } from 'flowbite-svelte';
	import RagSection from '$lib/components/RagSection.svelte';
	import ChatConfigForm from '$lib/components/ChatConfigForm.svelte';
	import AgentConfigForm from '$lib/components/agent/AgentConfigForm.svelte';
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

	let maxToolRoundtrips = $state(5);
	let parallelToolCalls = $state(false);
	let toolChoice = $state<'auto' | 'required' | 'none'>('auto');
	let selectedToolIds = $state<string[]>([]);
	let finalizationEnabled = $state(true);
	let finalizationToolName = $state('finalize_activity');
	let finalizationHandler = $state<'mark_complete_and_notify' | 'mark_complete_only' | 'notify_only'>(
		'mark_complete_and_notify'
	);
	let finalizationConfig = $state('');
	let requireFinalizationToolCall = $state(true);

	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error'>('success');
	let isDirty = $state(false);

	$effect(() => {
		if (isDirty) return;

		llmRole = data.agentConfig?.llmRole ?? '';
		llmInstructions = data.agentConfig?.llmInstructions ?? '';
		llmModel = data.agentConfig?.llmModel ?? data.defaultModel ?? '';
		temperature = data.agentConfig?.temperature ?? 0.7;
		maxTokens = data.agentConfig?.maxTokens ?? 2000;
		topP = data.agentConfig?.topP ?? 0.9;
		name = data.interactive?.name ?? '';
		description = data.interactive?.description ?? '';
		status = (data.interactive?.status ?? 'hidden') as typeof status;
		llmContext = data.agentConfig?.llmContext ?? '';
		systemPrompt = data.agentConfig?.systemPrompt ?? '';
		maxToolRoundtrips = data.agentConfig?.maxToolRoundtrips ?? 5;
		parallelToolCalls = data.agentConfig?.parallelToolCalls ?? false;
		toolChoice = (data.agentConfig?.toolChoice ?? 'auto') as typeof toolChoice;
		finalizationEnabled = data.agentConfig?.finalizationEnabled ?? true;
		finalizationToolName = data.agentConfig?.finalizationToolName ?? 'finalize_activity';
		finalizationHandler = (data.agentConfig?.finalizationHandler ??
			'mark_complete_and_notify') as typeof finalizationHandler;
		finalizationConfig = data.agentConfig?.finalizationConfig ?? '';
		requireFinalizationToolCall = data.agentConfig?.requireFinalizationToolCall ?? true;
		selectedToolIds = [...(data.assignedToolIds ?? [])];
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
				toastMessage = 'Agente actualizado correctamente';
				toastType = 'success';
			} else {
				showToast = true;
				toastMessage =
					result.type === 'failure' && result.data && 'message' in result.data
						? String(result.data.message)
						: 'Error al guardar los cambios';
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
				<div class="flex min-w-0 flex-1 items-center gap-3">
					<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
						<Bot class="h-4 w-4 text-green-600 dark:text-green-400" />
					</div>
					<h1 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
						Editar agente: {data.interactive.name}
					</h1>
				</div>
			</div>
		</div>
	</div>

	<div class="container mx-auto max-w-screen-xl px-4 py-6">
		<form
			method="POST"
			action="?/updateAgent"
			use:enhance={handleEnhance}
			class="space-y-6 rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800"
		>
			<ChatConfigForm
				bind:name
				bind:description
				bind:llmRole
				bind:llmInstructions
				bind:llmModel
				bind:temperature
				bind:maxTokens
				bind:topP
				bind:systemPrompt
				bind:llmContext
				bind:status
				models={data.models}
				defaultModel={data.defaultModel}
				showNameField={true}
				onchange={markDirty}
			/>

			<div>
				<h2 class="mb-4 text-base font-semibold text-gray-900 dark:text-white">
					Configuracion del Agente
				</h2>
				<AgentConfigForm
					bind:maxToolRoundtrips
					bind:parallelToolCalls
					bind:toolChoice
					bind:finalizationEnabled
					bind:finalizationToolName
					bind:finalizationHandler
					bind:finalizationConfig
					bind:requireFinalizationToolCall
					tools={data.activeTools}
					availableUIComponentKeys={data.availableUIComponentKeys}
					bind:selectedToolIds
					onchange={markDirty}
				/>
			</div>

			<div class="flex items-center gap-4">
				<button
					type="submit"
					class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
				>
					Guardar cambios
				</button>
				<a
					href={resolve(`/course/${cid}/admin/interactives/${ilid}`)}
					class="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Cancelar
				</a>
				{#if isDirty}
					<span class="text-xs text-amber-600 dark:text-amber-400">● Cambios sin guardar</span>
				{/if}
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
			title="Recursos compartidos de la actividad"
			description="Sube imágenes y documentos para reutilizarlos en prompts y UI del agente."
			warningMessage="Importante: estos adjuntos no sustituyen al RAG. Se usan como recursos visuales o enlaces que puedes referenciar en las instrucciones del agente."
			copyHint='En imágenes usa "Copiar nombre"; la tool buscará el recurso por nombre en esta actividad.'
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
