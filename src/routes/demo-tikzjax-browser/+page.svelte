<script lang="ts">
	import TikzjaxBrowserRenderer from '$lib/components/tikzjax/TikzjaxBrowserRenderer.svelte';
	import {
		tikzBrowserSupportedPackages,
		tikzExampleGroups,
		tikzExampleCategories,
		tikzExamples,
		type TikzExampleId
	} from '$lib/constants/tikzExamples';
	import {
		prepareTikzjaxBrowserDiagram,
		splitCommaSeparatedList
	} from '$lib/utils/tikzjaxBrowserDiagram';
	import type {
		TikzjaxBrowserRenderRequest,
		TikzjaxBrowserRenderState
	} from '$lib/types/tikzjax';

	const supportedPackages = tikzBrowserSupportedPackages;

	const examples = tikzExamples;
	const exampleGroups = tikzExampleGroups;

	let selectedExampleId = $state<TikzExampleId>(examples[0].id);
	let selectedExample = $derived(examples.find((candidate) => candidate.id === selectedExampleId) ?? examples[0]);
	let editorText = $state(examples[0].source);
	let texPackagesText = $state('');
	let tikzLibrariesText = $state('');
	let addToPreambleText = $state('');
	let normalizationNotes = $state<string[]>([]);
	let detectedPackages = $state<string[]>([]);
	let detectedLibraries = $state<string[]>([]);
	let normalizedSource = $state('');
	let renderMessage = $state('');
	let renderState = $state<TikzjaxBrowserRenderState>('idle');
	let isPasting = $state(false);
	let isRuntimeReady = $state(false);
	let renderVersion = $state(0);
	let renderedRequest = $state<TikzjaxBrowserRenderRequest | null>(null);

	function loadExample(exampleId: TikzExampleId) {
		const example = examples.find((candidate) => candidate.id === exampleId);

		if (!example) {
			return;
		}

		selectedExampleId = example.id;
		editorText = example.source;
		texPackagesText = '';
		tikzLibrariesText = '';
		addToPreambleText = '';
		normalizationNotes = [];
		detectedPackages = [];
		detectedLibraries = [];
		normalizedSource = '';
		renderMessage = '';
	}

	function prepareRenderRequest(): TikzjaxBrowserRenderRequest {
		const prepared = prepareTikzjaxBrowserDiagram({
			source: editorText,
			texPackages: splitCommaSeparatedList(texPackagesText),
			tikzLibraries: splitCommaSeparatedList(tikzLibrariesText),
			addToPreamble: addToPreambleText,
			showConsole: true,
			disableCache: true
		});

		normalizationNotes = prepared.normalizationNotes;
		detectedPackages = prepared.detectedPackages;
		detectedLibraries = prepared.detectedLibraries;
		normalizedSource = prepared.normalizedSource;

		return prepared.request;
	}

	function renderDiagram() {
		if (!isRuntimeReady) {
			renderMessage = 'Cargando el runtime TikZJax del navegador...';
			renderState = 'idle';
			return;
		}

		try {
			renderedRequest = prepareRenderRequest();
			renderVersion += 1;
			renderMessage = 'TikZJax está compilando en el navegador. Si falla, revisa la consola porque el paquete cliente expone allí el log TeX.';
			renderState = 'rendering';
		} catch (error) {
			renderedRequest = null;
			normalizationNotes = [];
			detectedPackages = [];
			detectedLibraries = [];
			normalizedSource = '';
			renderMessage = error instanceof Error ? error.message : 'No se pudo preparar el diagrama.';
			renderState = 'error';
		}
	}

	function handleRuntimeReady() {
		renderMessage = 'Runtime cargado e inicializado. Pulsa Renderizar En Cliente para compilar el diagrama.';
	}

	function handleRuntimeError(error: Error) {
		renderState = 'error';
		renderMessage = error.message;
	}

	function handleClientRenderFinished() {
		renderState = 'ready';
		renderMessage = 'TikZJax terminó de generar el SVG en cliente.';
	}

	async function pasteFromClipboard() {
		if (!navigator.clipboard) {
			renderMessage = 'El portapapeles no está disponible en este navegador.';
			return;
		}

		isPasting = true;

		try {
			const clipboardText = await navigator.clipboard.readText();

			if (!clipboardText.trim()) {
				renderMessage = 'El portapapeles está vacío.';
				return;
			}

			editorText = clipboardText;
			renderMessage = '';
		} catch {
			renderMessage = 'No se pudo leer el portapapeles. Prueba a pegar manualmente.';
		} finally {
			isPasting = false;
		}
	}

	function handleEditorKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			renderDiagram();
		}
	}

</script>

<svelte:head>
	<title>Demo TikZJax Browser</title>
</svelte:head>

<div class="space-y-6">
	<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
		<p class="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-700">Demo</p>
		<h1 class="mt-2 text-3xl font-semibold text-slate-900">TikZJax En Navegador</h1>
		<p class="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
			Esta pagina usa <code>@rod2ik/tikzjax</code> en cliente, pero ya consume exactamente el mismo catalogo de ejemplos que la ruta de servidor. Si pegas un documento completo, la demo adapta automaticamente <code>\usepackage</code>, <code>\usetikzlibrary</code> y preambulo extra al formato <code>data-*</code> del runtime de navegador.
		</p>
	</div>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
		<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<h2 class="text-lg font-semibold text-slate-900">Editor Cliente</h2>
					<p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
						Usa los presets del catalogo comun o pega tu propio ejemplo. La meta de esta pagina es servir como contraparte directa del renderer de servidor sin dividir el catalogo en dos listas distintas.
					</p>
				</div>
				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						onclick={pasteFromClipboard}
						class="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
						disabled={isPasting}
					>
						{isPasting ? 'Pegando...' : 'Pegar desde portapapeles'}
					</button>
					<button
						type="button"
						onclick={renderDiagram}
						class="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
					>
						Renderizar En Cliente
					</button>
				</div>
			</div>

			<div class="mt-6 space-y-5">
				{#each exampleGroups as group (group.category)}
					<div>
						<div class="mb-3 flex items-center justify-between gap-3">
							<p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{group.label}</p>
							<p class="text-xs text-slate-400">{group.examples.length} ejemplos</p>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each group.examples as example (example.id)}
								<button
									type="button"
									onclick={() => loadExample(example.id)}
									class={selectedExampleId === example.id
										? 'rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white'
										: 'rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900'}
								>
									{example.label}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
				<div class="flex flex-wrap items-center gap-2">
					<p class="font-semibold text-slate-900">{selectedExample.label}</p>
					<span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
						{tikzExampleCategories[selectedExample.category]}
					</span>
					<span class="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
						{selectedExample.priority === 'core' ? 'Base' : 'Ampliado'}
					</span>
				</div>
				<p class="mt-3">{selectedExample.description}</p>
				<p class="mt-2 text-slate-500">Objetivo didáctico: {selectedExample.learningGoal}</p>
			</div>

			<label for="browser-tikz-editor" class="mt-6 block text-sm font-medium text-slate-800">Fuente TeX o TikZ</label>
			<textarea
				id="browser-tikz-editor"
				bind:value={editorText}
				onkeydown={handleEditorKeydown}
				spellcheck="false"
				class="mt-3 min-h-112 w-full rounded-2xl border border-slate-300 bg-slate-950 p-4 font-mono text-sm leading-6 text-emerald-200 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
			></textarea>

			<div class="mt-6 grid gap-4 md:grid-cols-3">
				<div>
					<label for="browser-tex-packages" class="block text-sm font-medium text-slate-800">Paquetes TeX</label>
					<textarea
						id="browser-tex-packages"
						bind:value={texPackagesText}
						spellcheck="false"
						class="mt-2 min-h-36 w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
						placeholder="pgfplots, tikz-cd"
					></textarea>
				</div>
				<div>
					<label for="browser-tikz-libraries" class="block text-sm font-medium text-slate-800">Librerías TikZ</label>
					<input
						id="browser-tikz-libraries"
						bind:value={tikzLibrariesText}
						class="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
						placeholder="arrows.meta,calc,patterns"
					/>
					<p class="mt-2 text-xs leading-5 text-slate-500">Usa una lista CSV que se mapeará a <code>data-tikz-libraries</code>.</p>
				</div>
				<div>
					<label for="browser-preamble" class="block text-sm font-medium text-slate-800">Preambulo extra</label>
					<textarea
						id="browser-preamble"
						bind:value={addToPreambleText}
						spellcheck="false"
						class="mt-2 min-h-36 w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
						placeholder={"\\definecolor{miColor}{RGB}{12,80,160}"}
					></textarea>
				</div>
			</div>

			<div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
				<p class={renderState === 'error' ? 'text-rose-700' : 'text-slate-500'}>
					{renderMessage || 'Sin render todavía.'}
				</p>
				<p class="text-slate-500">{editorText.length} caracteres</p>
			</div>

			{#if normalizationNotes.length}
				<div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
					<p class="font-semibold">Normalización y compatibilidad</p>
					<ul class="mt-2 list-disc space-y-1 pl-5">
						{#each normalizationNotes as note (note)}
							<li>{note}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>

		<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="flex items-center justify-between gap-4">
				<h2 class="text-lg font-semibold text-slate-900">SVG renderizado por el navegador</h2>
				<p class="text-sm text-slate-500">
					{renderState === 'ready' ? 'Listo' : renderState === 'rendering' ? 'Renderizando...' : renderState === 'error' ? 'Error' : 'Esperando'}
				</p>
			</div>

			<TikzjaxBrowserRenderer
				bind:runtimeReady={isRuntimeReady}
				request={renderedRequest}
				renderKey={renderVersion}
				onRuntimeReady={handleRuntimeReady}
				onRuntimeError={handleRuntimeError}
				onRenderFinished={handleClientRenderFinished}
			/>

			<div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
				<h3 class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Bloque enviado a TikZJax</h3>
				<pre class="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-emerald-200">{normalizedSource || 'Sin render todavía.'}</pre>
				<div class="mt-4 grid gap-3 text-xs leading-6 text-slate-600 md:grid-cols-3">
					<div class="rounded-2xl bg-white p-3">
						<p class="font-semibold text-slate-900">Paquetes</p>
						<p class="mt-2 break-all">{detectedPackages.length ? detectedPackages.join(', ') : 'Ninguno'}</p>
					</div>
					<div class="rounded-2xl bg-white p-3">
						<p class="font-semibold text-slate-900">Librerías</p>
						<p class="mt-2 break-all">{detectedLibraries.length ? detectedLibraries.join(', ') : 'Ninguna'}</p>
					</div>
					<div class="rounded-2xl bg-white p-3">
						<p class="font-semibold text-slate-900">Preambulo extra</p>
						<pre class="mt-2 overflow-x-auto text-[11px] leading-5">{renderedRequest?.addToPreamble || 'Vacío'}</pre>
					</div>
				</div>
			</div>
		</section>

		<aside class="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm xl:col-span-2">
			<h2 class="text-lg font-semibold">Catalogo compartido en cliente</h2>
			<p class="mt-3 text-sm leading-6 text-slate-300">
				El runtime cliente sigue necesitando <code>data-tex-packages</code> y <code>data-tikz-libraries</code>, pero esa adaptacion ya es transparente. El foco de esta pagina ahora es probar el mismo repertorio amplio de circuitos, medidas, plots y optica desde el lado del navegador.
			</p>
			<div class="mt-4 grid gap-4 md:grid-cols-3">
				<div class="rounded-2xl bg-black/30 p-4 text-sm leading-6 text-slate-300">
					<p class="font-semibold text-white">1. Misma biblioteca de ejemplos</p>
					<p class="mt-2">{supportedPackages.join(', ')}.</p>
				</div>
				<div class="rounded-2xl bg-black/30 p-4 text-sm leading-6 text-slate-300">
					<p class="font-semibold text-white">2. Categorias didacticas</p>
					<p class="mt-2">La navegacion por grupos permite saltar rapido entre fundamentos, filtros, conversion, medida, plots y optica.</p>
				</div>
				<div class="rounded-2xl bg-black/30 p-4 text-sm leading-6 text-slate-300">
					<p class="font-semibold text-white">3. Consola disponible</p>
					<p class="mt-2">El log TeX sigue habilitado en DevTools para depurar cualquier ejemplo nuevo que pegues manualmente.</p>
				</div>
			</div>
		</aside>
	</div>
</div>
