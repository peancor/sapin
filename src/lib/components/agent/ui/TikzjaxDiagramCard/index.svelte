<script lang="ts">
	import TikzjaxBrowserRenderer from '$lib/components/tikzjax/TikzjaxBrowserRenderer.svelte';
	import type {
		TikzjaxBrowserRenderRequest,
		TikzjaxBrowserRenderState
	} from '$lib/types/tikzjax';

	interface Props {
		instanceId: string;
		request: TikzjaxBrowserRenderRequest | null;
		normalizedSource: string;
		normalizationNotes?: string[];
		detectedPackages?: string[];
		detectedLibraries?: string[];
		title?: string;
		caption?: string;
		ariaLabel?: string;
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score?: number) => void;
	}

	let { instanceId, request, normalizedSource, normalizationNotes = [], detectedPackages = [], detectedLibraries = [], title, caption }: Props =
		$props();

	let runtimeReady = $state(false);
	let renderState = $state<TikzjaxBrowserRenderState>('idle');
	let renderMessage = $state('Cargando el runtime de TikZJax...');

	const displayTitle = $derived(title?.trim() || 'Diagrama TikZJax');
	const filteredNotes = $derived(normalizationNotes.filter((note) => note.trim().length > 0));
	const filteredPackages = $derived(detectedPackages.filter((item) => item.trim().length > 0));
	const filteredLibraries = $derived(detectedLibraries.filter((item) => item.trim().length > 0));

	function handleRuntimeReady() {
		renderState = 'rendering';
		renderMessage =
			'TikZJax está compilando el diagrama en el navegador. Si falla, revisa la consola del navegador.';
	}

	function handleRuntimeError(error: Error) {
		renderState = 'error';
		renderMessage = error.message;
	}

	function handleRenderFinished() {
		renderState = 'ready';
		renderMessage = 'TikZJax terminó de generar el SVG en cliente.';
	}
</script>

<div
	class="my-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
	data-instance-id={instanceId}
>
	<div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
		<div class="flex min-w-0 items-center gap-2">
			<svg class="h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 7h16M4 12h10M4 17h16"
				/>
			</svg>
			<span class="truncate text-sm font-semibold text-gray-900 dark:text-white">{displayTitle}</span>
		</div>
		<span
			class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
		>
			TikZJax
		</span>
	</div>

	<div class="px-3 py-3 sm:px-4">
		<div class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
			<p class={renderState === 'error' ? 'text-red-600 dark:text-red-300' : ''}>{renderMessage}</p>
			<p>
				{renderState === 'ready'
					? 'Listo'
					: renderState === 'rendering'
						? 'Renderizando...'
						: renderState === 'error'
							? 'Error'
							: 'Esperando runtime'}
			</p>
		</div>

		{#if request}
			<TikzjaxBrowserRenderer
				bind:runtimeReady
				request={request}
				onRuntimeReady={handleRuntimeReady}
				onRuntimeError={handleRuntimeError}
				onRenderFinished={handleRenderFinished}
			/>
		{:else}
			<div class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
				No hay una configuración válida de TikZJax para renderizar este diagrama.
			</div>
		{/if}

		{#if caption?.trim()}
			<p class="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{caption}</p>
		{/if}

		<details class="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900">
			<summary class="cursor-pointer font-medium text-gray-700 dark:text-gray-200">
				Detalles técnicos
			</summary>

			{#if filteredNotes.length}
				<ul class="mt-3 list-disc space-y-1 pl-4 text-gray-600 dark:text-gray-300">
					{#each filteredNotes as note (note)}
						<li>{note}</li>
					{/each}
				</ul>
			{/if}

			<div class="mt-3 grid gap-3 md:grid-cols-2">
				<div class="rounded-lg bg-white p-3 dark:bg-gray-950">
					<p class="font-semibold text-gray-900 dark:text-gray-100">Paquetes</p>
					<p class="mt-2 break-all text-gray-600 dark:text-gray-300">
						{filteredPackages.length ? filteredPackages.join(', ') : 'Ninguno'}
					</p>
				</div>
				<div class="rounded-lg bg-white p-3 dark:bg-gray-950">
					<p class="font-semibold text-gray-900 dark:text-gray-100">Librerías TikZ</p>
					<p class="mt-2 break-all text-gray-600 dark:text-gray-300">
						{filteredLibraries.length ? filteredLibraries.join(', ') : 'Ninguna'}
					</p>
				</div>
			</div>

			<p class="mt-3 font-semibold text-gray-900 dark:text-gray-100">Fuente normalizada</p>
			<pre class="mt-2 overflow-x-auto rounded-lg bg-white p-3 leading-5 text-gray-700 dark:bg-gray-950 dark:text-gray-200">{normalizedSource}</pre>
		</details>
	</div>
</div>
