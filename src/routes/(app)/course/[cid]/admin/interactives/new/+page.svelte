<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { page } from '$app/stores';
	import { ArrowLeft, MessageSquare, Bot } from 'lucide-svelte';
	import ChatConfigForm from '$lib/components/ChatConfigForm.svelte';
	import AgentConfigForm from '$lib/components/agent/AgentConfigForm.svelte';
	import { onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Activity type selector
	let selectedType = $state<'chat' | 'agent'>('chat');

	// Chat configuration fields
	let name = $state('');
	let description = $state('');
	let llmRole = $state('');
	let llmInstructions = $state('');
	let llmModel = $state('');
	let temperature = $state(0.7);
	let maxTokens = $state(2000);
	let topP = $state(0.9);
	let systemPrompt = $state('');
	let llmContext = $state('');
	let status = $state<'hidden' | 'published' | 'closed' | 'archived'>('hidden');

	// Agent configuration fields
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

	let isDirty = $state(false);

	// Initialize model from data
	$effect(() => {
		if (!llmModel && data.defaultModel) {
			llmModel = data.defaultModel;
		}
	});

	function markDirty() {
		isDirty = true;
	}

	// Configurar breadcrumbs usando $page.params
	breadcrumb.set([
		{ label: 'Inicio', href: '/' },
		{ label: 'Cursos', href: '/course' },
		{ label: 'Curso', href: `/course/${$page.params.cid}` },
		{ label: 'Interactivos', href: `/course/${$page.params.cid}/admin/interactives` },
		{ label: 'Nuevo' }
	]);

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
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header with back arrow -->
	<div class="sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm">
		<div class="container mx-auto px-4 max-w-screen-xl">
			<div class="flex items-center gap-4 py-4">
				<a
					href="/course/{$page.params.cid}/admin"
					class="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					title="Volver al curso"
				>
					<ArrowLeft size={20} class="text-gray-500 dark:text-gray-400" />
				</a>
				<div class="min-w-0 flex-1">
					<h1 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
						Crear Nuevo Aprendizaje Interactivo
					</h1>
				</div>
			</div>
		</div>
	</div>

	<!-- Content Area -->
	<div class="container mx-auto px-4 py-6 max-w-screen-xl">

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			return async ({ result }) => {
				if (result.type === 'redirect') {
					isDirty = false;
					goto(`/course/${data.courseId}/admin`, { invalidateAll: true });
				}
			};
		}}
		class="space-y-6 rounded-lg bg-white p-6 shadow dark:bg-gray-800"
	>
		<!-- Type selector -->
		<input type="hidden" name="type" value={selectedType} />

		<div>
			<label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
				Tipo de actividad
			</label>
			<div class="grid gap-3 sm:grid-cols-2">
				<button
					type="button"
					onclick={() => { selectedType = 'chat'; markDirty(); }}
					class="flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors {selectedType === 'chat'
						? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
						: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}"
				>
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
						<MessageSquare class="h-5 w-5 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<p class="font-medium text-gray-900 dark:text-white">Conversacional (Chat)</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">Chat interactivo con un rol IA</p>
					</div>
				</button>
				<button
					type="button"
					onclick={() => { selectedType = 'agent'; markDirty(); }}
					class="flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors {selectedType === 'agent'
						? 'border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-900/20'
						: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}"
				>
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
						<Bot class="h-5 w-5 text-green-600 dark:text-green-400" />
					</div>
					<div>
						<p class="font-medium text-gray-900 dark:text-white">Agente con Herramientas</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">Agente IA con acceso a herramientas</p>
					</div>
				</button>
			</div>
		</div>

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

		{#if selectedType === 'agent'}
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
		{/if}

		<div class="flex gap-4">
			<button type="submit" class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">
				Crear
			</button>
			<a
				href={`/course/${data.courseId}/admin`}
				class="rounded border px-4 py-2 hover:bg-gray-100 dark:border-gray-600 dark:text-white"
			>
				Cancelar
			</a>
		</div>
	</form>
	</div>
</div>
