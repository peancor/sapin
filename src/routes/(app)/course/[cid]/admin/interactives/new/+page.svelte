<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { breadcrumb } from '$lib/stores/breadcrumb';
	import { page } from '$app/stores';
	import { ArrowLeft } from 'lucide-svelte';
	import ChatConfigForm from '$lib/components/ChatConfigForm.svelte';
	import { onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import textContentOfSystemPrompt from '$lib/helpers/systemPromptTemplateRAG.md?raw';

	let { data }: { data: PageData } = $props();

	// Chat configuration fields
	let name = $state('');
	let description = $state('');
	let llmRole = $state('');
	let llmInstructions = $state('');
	let llmModel = $state('');
	let temperature = $state(0.7);
	let maxTokens = $state(2000);
	let topP = $state(0.9);
	let systemPrompt = $state(''); //por defecto vacío para que se use el system prompt predefinido en el sistema.
	let llmContext = $state('');
	let status = $state<'hidden' | 'published' | 'closed' | 'archived'>('hidden');

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
				console.log(result);
				if (result.type === 'redirect') {
					isDirty = false;
					goto(`/course/${data.courseId}/admin`, { invalidateAll: true });
				}
			};
		}}
		class="space-y-6 rounded-lg bg-white p-6 shadow dark:bg-gray-800"
	>
		<!-- Hidden type field (only chat supported) -->
		<input type="hidden" name="type" value="chat" />

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
