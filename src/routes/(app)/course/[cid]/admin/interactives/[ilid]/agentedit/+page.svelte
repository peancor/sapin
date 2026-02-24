<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { ArrowLeft, Bot } from 'lucide-svelte';
	import { Toast } from 'flowbite-svelte';
	import ChatConfigForm from '$lib/components/ChatConfigForm.svelte';
	import AgentConfigForm from '$lib/components/AgentConfigForm.svelte';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	const { cid, ilid } = page.params;

	let llmRole = $state('');
	let llmInstructions = $state('');
	let llmModel = $state('');
	let temperature = $state(0.7);
	let maxTokens = $state(2000);
	let topP = $state(0.9);
	let description = $state('');
	let status = $state<'hidden' | 'published' | 'closed' | 'archived'>('hidden');
	let llmContext = $state('');
	let systemPrompt = $state('');

	let maxToolRoundtrips = $state(5);
	let parallelToolCalls = $state(false);
	let toolChoice = $state<'auto' | 'required' | 'none'>('auto');
	let selectedToolIds = $state<string[]>([]);
	let selectedUIComponentIds = $state<string[]>([]);

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
		description = data.interactive?.description ?? '';
		status = (data.interactive?.status ?? 'hidden') as typeof status;
		llmContext = data.agentConfig?.llmContext ?? '';
		systemPrompt = data.agentConfig?.systemPrompt ?? '';

		maxToolRoundtrips = data.agentConfig?.maxToolRoundtrips ?? 5;
		parallelToolCalls = data.agentConfig?.parallelToolCalls ?? false;
		toolChoice = (data.agentConfig?.toolChoice ?? 'auto') as typeof toolChoice;
		selectedToolIds = [...(data.assignedToolIds ?? [])];
		selectedUIComponentIds = [...(data.assignedUIComponentIds ?? [])];
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
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header -->
	<div class="sticky top-0 z-10 bg-white shadow-sm dark:bg-gray-800">
		<div class="container mx-auto max-w-screen-xl px-4">
			<div class="flex items-center gap-4 py-4">
				<a
					href="/course/{cid}/admin/interactives/{ilid}"
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

	<!-- Content -->
	<div class="container mx-auto max-w-screen-xl px-4 py-6">
		<form
			method="POST"
			action="?/updateAgent"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						isDirty = false;
						showToast = true;
						toastMessage = 'Agente actualizado correctamente';
						toastType = 'success';
						setTimeout(() => (showToast = false), 3000);
					} else {
						showToast = true;
						toastMessage = 'Error al guardar los cambios';
						toastType = 'error';
						setTimeout(() => (showToast = false), 3000);
					}
				};
			}}
			class="space-y-6"
		>
			<!-- Chat / LLM config -->
			<div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
				<ChatConfigForm
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
					showNameField={false}
					onchange={markDirty}
				/>
			</div>

			<!-- Agent-specific config -->
			<div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
				<h2 class="mb-4 text-base font-semibold text-gray-900 dark:text-white">
					Configuración del Agente
				</h2>
				<AgentConfigForm
					bind:maxToolRoundtrips
					bind:parallelToolCalls
					bind:toolChoice
					tools={data.activeTools}
					bind:selectedToolIds
					uiComponents={data.activeUIComponents}
					bind:selectedUIComponentIds
					onchange={markDirty}
				/>
			</div>

			<!-- Actions -->
			<div class="flex items-center gap-4">
				<button
					type="submit"
					class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
				>
					Guardar cambios
				</button>
				<a
					href="/course/{cid}/admin/interactives/{ilid}"
					class="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Cancelar
				</a>
				{#if isDirty}
					<span class="text-xs text-amber-600 dark:text-amber-400">● Cambios sin guardar</span>
				{/if}
			</div>
		</form>
	</div>
</div>

<!-- Toast -->
{#if showToast}
	<div class="fixed bottom-4 right-4 z-50">
		<Toast color={toastType === 'success' ? 'green' : 'red'}>
			{toastMessage}
		</Toast>
	</div>
{/if}
