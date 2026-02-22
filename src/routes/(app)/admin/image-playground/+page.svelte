<script lang="ts">
	import { ImagePlus, Download, Trash2, Sparkles } from 'lucide-svelte';
	import { Select, Label, Spinner, Button, Textarea } from 'flowbite-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Estado
	let selectedModel = $state('');
	let selectedAspectRatio = $state('1:1');
	let prompt = $state('');
	let isLoading = $state(false);
	let errorMessage = $state('');
	let generatedImages = $state<string[]>([]);
	let responseContent = $state('');

	// Opciones para los selects
	let modelItems = $derived(
		data.models.map((m) => ({
			value: m.name,
			name: `${m.name} (${m.provider})`
		}))
	);

	let aspectRatioItems = $derived(
		data.aspectRatios.map((ar) => ({
			value: ar.value,
			name: ar.label
		}))
	);

	// Inicializar valores por defecto
	$effect(() => {
		if (!selectedModel && data.defaultModel) {
			selectedModel = data.defaultModel;
		}
	});

	async function generateImage() {
		if (!prompt.trim() || !selectedModel) return;

		isLoading = true;
		errorMessage = '';
		generatedImages = [];
		responseContent = '';

		try {
			const response = await fetch('/api/admin/image-playground/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					prompt: prompt.trim(),
					model: selectedModel,
					aspectRatio: selectedAspectRatio
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Error al generar imagen');
			}

			if (result.images && result.images.length > 0) {
				generatedImages = result.images;
			} else {
				throw new Error('No se generaron imágenes');
			}

			if (result.content) {
				responseContent = result.content;
			}
		} catch (error) {
			console.error('Error generating image:', error);
			errorMessage = error instanceof Error ? error.message : 'Error desconocido';
		} finally {
			isLoading = false;
		}
	}

	function clearAll() {
		prompt = '';
		generatedImages = [];
		responseContent = '';
		errorMessage = '';
	}

	function downloadImage(imageUrl: string, index: number) {
		const link = document.createElement('a');
		link.href = imageUrl;
		link.download = `generated-image-${Date.now()}-${index + 1}.png`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}
</script>

<div class="flex h-[calc(100vh-16rem)] flex-col">
	<!-- Header -->
	<div class="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400">
				<ImagePlus class="h-5 w-5" />
			</div>
			<div>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Playground de Imágenes</h2>
				<p class="text-sm text-gray-500 dark:text-gray-400">Genera imágenes con modelos de IA</p>
			</div>
		</div>

		<Button color="alternative" size="sm" onclick={clearAll} disabled={generatedImages.length === 0 && !prompt}>
			<Trash2 class="mr-2 h-4 w-4" />
			Limpiar
		</Button>
	</div>

	{#if data.models.length === 0}
		<div class="flex flex-1 items-center justify-center">
			<div class="text-center">
				<ImagePlus class="mx-auto h-12 w-12 text-gray-400" />
				<h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
					No hay modelos de imagen configurados
				</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Configura la API key de OpenRouter en
					<a href="/admin/settings" class="text-primary-600 hover:underline dark:text-primary-400">
						Configuración
					</a>
				</p>
			</div>
		</div>
	{:else}
		<div class="flex flex-1 gap-6 overflow-hidden">
			<!-- Panel izquierdo: Configuración -->
			<div class="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
				<div>
					<Label for="model-select" class="mb-2">Modelo</Label>
					<Select
						id="model-select"
						items={modelItems}
						bind:value={selectedModel}
						placeholder="Selecciona un modelo..."
						size="md"
					/>
				</div>

				<div>
					<Label for="aspect-ratio-select" class="mb-2">Relación de aspecto</Label>
					<Select
						id="aspect-ratio-select"
						items={aspectRatioItems}
						bind:value={selectedAspectRatio}
						size="md"
					/>
				</div>

				<div class="flex-1">
					<Label for="prompt-input" class="mb-2">Prompt</Label>
					<Textarea
						id="prompt-input"
						bind:value={prompt}
						placeholder="Describe la imagen que quieres generar..."
						rows={6}
						class="resize-none"
					/>
				</div>

				<Button
					color="purple"
					onclick={generateImage}
					disabled={!prompt.trim() || !selectedModel || isLoading}
					class="w-full"
				>
					{#if isLoading}
						<Spinner size="4" class="mr-2" />
						Generando...
					{:else}
						<Sparkles class="mr-2 h-4 w-4" />
						Generar imagen
					{/if}
				</Button>

				{#if errorMessage}
					<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
						{errorMessage}
					</div>
				{/if}
			</div>

			<!-- Panel derecho: Resultado -->
			<div class="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
				{#if isLoading}
					<div class="flex flex-1 items-center justify-center">
						<div class="text-center">
							<Spinner size="12" color="purple" />
							<p class="mt-4 text-gray-500 dark:text-gray-400">Generando imagen...</p>
							<p class="text-sm text-gray-400 dark:text-gray-500">Esto puede tardar unos segundos</p>
						</div>
					</div>
				{:else if generatedImages.length > 0}
					<div class="flex-1 overflow-y-auto p-4">
						<div class="grid gap-4 {generatedImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
							{#each generatedImages as image, index (index)}
								<div class="group relative overflow-hidden rounded-lg bg-white shadow-md dark:bg-gray-800">
									<img
										src={image}
										alt="Imagen generada {index + 1}"
										class="h-auto w-full object-contain"
									/>
									<div class="absolute bottom-0 left-0 right-0 flex justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
										<Button
											size="sm"
											color="light"
											onclick={() => downloadImage(image, index)}
										>
											<Download class="mr-1 h-4 w-4" />
											Descargar
										</Button>
									</div>
								</div>
							{/each}
						</div>
						{#if responseContent}
							<div class="mt-4 rounded-lg bg-white p-4 dark:bg-gray-800">
								<p class="text-sm text-gray-600 dark:text-gray-300">{responseContent}</p>
							</div>
						{/if}
					</div>
				{:else}
					<div class="flex flex-1 items-center justify-center text-gray-500 dark:text-gray-400">
						<div class="text-center">
							<ImagePlus class="mx-auto h-12 w-12 opacity-30" />
							<p class="mt-4">Escribe un prompt y genera una imagen</p>
							<p class="text-sm opacity-75">Las imágenes aparecerán aquí</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
