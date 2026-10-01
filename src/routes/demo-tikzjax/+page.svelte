<script lang="ts">
	import { base } from '$app/paths';
	import {
		tikzExampleGroups,
		tikzExampleCategories,
		tikzExamples,
		tikzServerSupportedPackages,
		type TikzExampleId
	} from '$lib/constants/tikzExamples';
	import { onMount } from 'svelte';

	const examples = tikzExamples;
	const exampleGroups = tikzExampleGroups;
	const supportedPackages = tikzServerSupportedPackages;

	let selectedExampleId = $state<TikzExampleId>(examples[0].id);
	let selectedExample = $derived(examples.find((candidate) => candidate.id === selectedExampleId) ?? examples[0]);
	let editorText = $state(examples[0].source);
	let svgMarkup = $state('');
	let normalizedSource = $state('');
	let serverNotes = $state<string[]>([]);
	let detectedPackages = $state<string[]>([]);
	let renderError = $state('');
	let isPasting = $state(false);
	let renderState = $state<'idle' | 'rendering' | 'ready' | 'error'>('idle');

	function loadExample(exampleId: TikzExampleId) {
		const example = examples.find((candidate) => candidate.id === exampleId);

		if (!example) {
			return;
		}

		selectedExampleId = example.id;
		editorText = example.source;
		renderError = '';
		serverNotes = [];
		detectedPackages = [];
	}

	async function pasteFromClipboard() {
		if (!navigator.clipboard) {
			renderError = 'El portapapeles no está disponible en este navegador.';
			return;
		}

		isPasting = true;

		try {
			const clipboardText = await navigator.clipboard.readText();

			if (!clipboardText.trim()) {
				renderError = 'El portapapeles está vacío.';
				return;
			}

			editorText = clipboardText;
			renderError = '';
		} catch {
			renderError = 'No se pudo leer el portapapeles. Prueba a pegar manualmente.';
		} finally {
			isPasting = false;
		}
	}

	async function renderDiagram() {
		renderState = 'rendering';
		renderError = '';

		try {
			const response = await fetch(`${base}/demo-tikzjax/render`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({ source: editorText })
			});

			const payload = (await response.json()) as {
				svg?: string;
				error?: string;
				normalizedSource?: string;
				notes?: string[];
				detectedPackages?: string[];
			};

			if (!response.ok || !payload.svg) {
				throw new Error(payload.error ?? 'No se pudo renderizar el diagrama.');
			}

			svgMarkup = payload.svg;
			normalizedSource = payload.normalizedSource ?? editorText;
			serverNotes = payload.notes ?? [];
			detectedPackages = payload.detectedPackages ?? [];
			renderState = 'ready';
		} catch (error) {
			svgMarkup = '';
			normalizedSource = '';
			serverNotes = [];
			detectedPackages = [];
			renderError = error instanceof Error ? error.message : 'No se pudo renderizar el diagrama.';
			renderState = 'error';
		}
	}

	function handleEditorKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			void renderDiagram();
		}
	}

	onMount(() => {
		void renderDiagram();
	});
</script>

<svelte:head>
	<title>Demo TikZJax</title>
	<link rel="stylesheet" href="/vendor/node-tikzjax/fonts.css" />
</svelte:head>

<div class="space-y-6">
	<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
		<p class="text-sm font-semibold uppercase tracking-[0.28em] text-sky-700">Demo</p>
		<h1 class="mt-2 text-3xl font-semibold text-slate-900">Node-TikZJax En Servidor</h1>
		<p class="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
			Esta version renderiza en servidor con <code>node-tikzjax</code> y comparte el mismo catalogo de ejemplos que la demo de navegador. La idea ahora es usar estas dos rutas como banco comun para circuitos didacticos, plots, optica y otros diagramas cientificos.
		</p>
	</div>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
		<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<h2 class="text-lg font-semibold text-slate-900">Editor TeX</h2>
					<p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
						Pega un ejemplo completo con <code>\usepackage</code> y <code>\begin&#123;document&#125;</code>, o usa uno de los presets. El render ocurre en el servidor. Usa <kbd class="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600">Ctrl</kbd>
						+
						<kbd class="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600">Enter</kbd>
						para renderizar.
					</p>
				</div>
				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						onclick={pasteFromClipboard}
						class="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
						disabled={isPasting}
					>
						{isPasting ? 'Pegando...' : 'Pegar desde portapapeles'}
					</button>
					<button
						type="button"
						onclick={() => void renderDiagram()}
						class="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
					>
						Renderizar
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
					<span class="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
						{tikzExampleCategories[selectedExample.category]}
					</span>
					<span class="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
						{selectedExample.priority === 'core' ? 'Base' : 'Ampliado'}
					</span>
				</div>
				<p class="mt-3">{selectedExample.description}</p>
				<p class="mt-2 text-slate-500">Objetivo didáctico: {selectedExample.learningGoal}</p>
			</div>

			<label for="tikz-editor" class="mt-6 block text-sm font-medium text-slate-800">Fuente TeX</label>
			<textarea
				id="tikz-editor"
				bind:value={editorText}
				onkeydown={handleEditorKeydown}
				spellcheck="false"
				class="mt-3 min-h-112 w-full rounded-2xl border border-slate-300 bg-slate-950 p-4 font-mono text-sm leading-6 text-emerald-200 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
			></textarea>

			<div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
				<p class={renderError ? 'text-rose-700' : 'text-slate-500'}>
					{renderError || 'El servidor compilará el TeX con node-tikzjax.'}
				</p>
				<p class="text-slate-500">{editorText.length} caracteres</p>
			</div>

			<div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
				<p class="font-semibold text-slate-900">Paquetes declarados por node-tikzjax</p>
				<p class="mt-2">{supportedPackages.join(', ')}</p>
			</div>
		</section>

		<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="flex items-center justify-between gap-4">
				<h2 class="text-lg font-semibold text-slate-900">SVG renderizado</h2>
				<p class="text-sm text-slate-500">
					{renderState === 'ready' ? 'Listo' : renderState === 'rendering' ? 'Renderizando...' : renderState === 'error' ? 'Error' : 'Esperando'}
				</p>
			</div>

			<div class="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-6">
				{#if svgMarkup}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="mx-auto min-h-56 max-w-4xl">{@html svgMarkup}</div>
				{:else if renderState === 'rendering'}
					<p class="text-sm text-slate-500">Compilando TeX en el servidor...</p>
				{:else}
					<p class="text-sm text-slate-500">Aún no hay SVG disponible.</p>
				{/if}
			</div>

			<div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
				<h3 class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Fuente normalizada enviada al servidor</h3>
				<p class="mt-2 text-sm leading-6 text-slate-600">
					El endpoint ajusta algunos casos mínimos, como fuentes sin <code>{'\\begin{document}'}</code>. El resto se compila tal cual con <code>node-tikzjax</code>.
				</p>
				<pre class="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-emerald-200">{normalizedSource || 'Sin render todavía.'}</pre>
				<div class="mt-4 grid gap-3 text-xs leading-6 text-slate-600 md:grid-cols-2">
					<div class="rounded-2xl bg-white p-3">
						<p class="font-semibold text-slate-900">Paquetes detectados</p>
						<p class="mt-2">{detectedPackages.length ? detectedPackages.join(', ') : 'Ninguno'}</p>
					</div>
					<div class="rounded-2xl bg-white p-3">
						<p class="font-semibold text-slate-900">Notas del normalizador</p>
						<ul class="mt-2 list-disc space-y-1 pl-5">
							{#if serverNotes.length}
								{#each serverNotes as note (note)}
									<li>{note}</li>
								{/each}
							{:else}
								<li>Sin cambios automáticos.</li>
							{/if}
						</ul>
					</div>
				</div>
			</div>
		</section>

		<aside class="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm xl:col-span-2">
			<h2 class="text-lg font-semibold">Qué Cambió</h2>
			<p class="mt-3 text-sm leading-6 text-slate-300">
				La ruta de servidor ya no es solo una prueba tecnica. Ahora actua como referencia principal del catalogo compartido, con ejemplos organizados por bloques didacticos para leyes basicas, filtros, conversion, medida y optica.
			</p>
			<div class="mt-4 grid gap-4 md:grid-cols-3">
				<div class="rounded-2xl bg-black/30 p-4 text-sm leading-6 text-slate-300">
					<p class="font-semibold text-white">1. Catalogo comun</p>
					<p class="mt-2">La seleccion de ejemplos sale del mismo modulo que usa la demo de navegador.</p>
				</div>
				<div class="rounded-2xl bg-black/30 p-4 text-sm leading-6 text-slate-300">
					<p class="font-semibold text-white">2. Cobertura amplia</p>
					<p class="mt-2">El catalogo ya incluye desde leyes de Kirchhoff hasta puentes, filtros, Bode y optica geometrica.</p>
				</div>
				<div class="rounded-2xl bg-black/30 p-4 text-sm leading-6 text-slate-300">
					<p class="font-semibold text-white">3. Pegado libre</p>
					<p class="mt-2">Sigues pudiendo sustituir cualquier preset por tu propio TeX completo y renderizarlo directamente.</p>
				</div>
			</div>
		</aside>
	</div>
</div>