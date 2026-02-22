<script lang="ts">
	import { Trash2, Bot } from 'lucide-svelte';
	import { Select, Label, Button } from 'flowbite-svelte';
	import ChatComponent from '$lib/components/ChatComponent.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Modelo seleccionado - inicializado con el modelo por defecto
	let selectedModel = $state('');
	let modelItems = $derived(
		data.models.map((m) => ({
			value: m.name,
			name: `${m.name} (${m.provider})`
		}))
	);

	// Key para reiniciar el ChatComponent cuando se limpia o cambia modelo
	let chatKey = $state(0);

	// Endpoint dinámico basado en el modelo seleccionado (modelo en el path para compatible con ChatComponent)
	let apiEndpoint = $derived(
		selectedModel ? `/api/admin/model-playground/${encodeURIComponent(selectedModel)}/ask` : ''
	);

	function clearChat() {
		// Incrementar la key fuerza a Svelte a recrear el componente
		chatKey++;
	}

	// Inicializar el modelo seleccionado con el valor por defecto
	$effect(() => {
		if (!selectedModel && data.defaultModel) {
			selectedModel = data.defaultModel;
		}
	});
</script>

<div class="flex h-[calc(100vh-16rem)] flex-col">
	<!-- Header con selector de modelo -->
	<div class="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400">
				<Bot class="h-5 w-5" />
			</div>
			<div>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Playground de Modelos</h2>
				<p class="text-sm text-gray-500 dark:text-gray-400">Prueba los modelos de IA activos</p>
			</div>
		</div>

		<div class="flex items-center gap-4">
			<div class="min-w-[280px]">
				<Label for="model-select" class="sr-only">Seleccionar modelo</Label>
				<Select
					id="model-select"
					items={modelItems}
					bind:value={selectedModel}
					placeholder="Selecciona un modelo..."
					size="md"
				/>
			</div>
			<Button
				color="alternative"
				size="sm"
				onclick={clearChat}
			>
				<Trash2 class="mr-2 h-4 w-4" />
				Limpiar
			</Button>
		</div>
	</div>

	{#if data.models.length === 0}
		<div class="flex flex-1 items-center justify-center">
			<div class="text-center">
				<Bot class="mx-auto h-12 w-12 text-gray-400" />
				<h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
					No hay modelos activos
				</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Configura los modelos de IA en la sección de
					<a href="/admin/ai-models" class="text-primary-600 hover:underline dark:text-primary-400">
						Modelos IA
					</a>
				</p>
			</div>
		</div>
	{:else if selectedModel}
		<!-- Chat container usando ChatComponent -->
		<div class="model-playground-chat flex-1 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			{#key chatKey}
				<ChatComponent {apiEndpoint} />
			{/key}
		</div>
	{:else}
		<div class="flex flex-1 items-center justify-center text-gray-500 dark:text-gray-400">
			<div class="text-center">
				<Bot class="mx-auto h-8 w-8 opacity-50" />
				<p class="mt-2">Selecciona un modelo para comenzar</p>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Ocultar el warning de profesores en el playground de admin */
	.model-playground-chat :global(.border-orange-400) {
		display: none;
	}
</style>
