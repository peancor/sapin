<script lang="ts">
	import { base } from '$app/paths';
	import {
		tikzBrowserSupportedPackages,
		tikzExampleGroups,
		tikzExampleCategories,
		tikzExamples,
		type TikzExampleId
	} from '$lib/constants/tikzExamples';
	import { onMount } from 'svelte';

	interface BrowserRenderRequest {
		source: string;
		texPackagesJson: string;
		tikzLibraries: string;
		addToPreamble: string;
		showConsole: boolean;
		disableCache: boolean;
		ariaLabel: string;
		width: string;
		height: string;
	}

	const supportedPackages = tikzBrowserSupportedPackages;

	const preambleLinePattern = /^\\(?:documentclass|usepackage|usetikzlibrary|pgfplotsset|ctikzset|tikzset|definecolor|colorlet|def|newcommand|renewcommand|providecommand|input)\b/;

	const examples = tikzExamples;
	const exampleGroups = tikzExampleGroups;
	const tikzjaxScriptId = 'demo-tikzjax-browser-runtime';
	const tikzjaxRuntimeBasePath = `${base}/${(globalThis as typeof globalThis & { __TIKZJAX_RUNTIME_PUBLIC_DIR__: string }).__TIKZJAX_RUNTIME_PUBLIC_DIR__}`;
	let tikzjaxRuntimePromise: Promise<void> | null = null;

	function splitCsv(value: string): string[] {
		return value
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function unique(items: string[]): string[] {
		return [...new Set(items)];
	}

	function extractPackagesFromPreamble(preamble: string): Record<string, string> {
		const packages: Record<string, string> = {};

		for (const match of preamble.matchAll(/\\usepackage(?:\[([^\]]*)\])?\{([^}]*)\}/g)) {
			const packageOptions = match[1] ?? '';
			const packageNames = splitCsv(match[2] ?? '');

			for (const packageName of packageNames) {
				packages[packageName] = packageOptions;
			}
		}

		return packages;
	}

	function extractTikzLibrariesFromPreamble(preamble: string): string[] {
		const libraries: string[] = [];

		for (const match of preamble.matchAll(/\\usetikzlibrary\{([^}]*)\}/g)) {
			libraries.push(...splitCsv(match[1] ?? ''));
		}

		return unique(libraries);
	}

	function cleanPreamble(preamble: string): string {
		return preamble
			.replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/g, '')
			.replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]*\}/g, '')
			.replace(/\\usetikzlibrary\{[^}]*\}/g, '')
			.replace(/^[\t ]*$/gm, '')
			.trim();
	}

	function parsePackagesJson(value: string): Record<string, string> {
		if (!value.trim()) {
			return {};
		}

		const parsed = JSON.parse(value) as Record<string, unknown>;

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new Error('El campo de paquetes debe ser un objeto JSON.');
		}

		return Object.fromEntries(
			Object.entries(parsed).map(([key, packageOptions]) => [key, String(packageOptions ?? '')])
		);
	}

	function stringifyPackagesMap(packages: Record<string, string>): string {
		const entries = Object.entries(packages);

		if (!entries.length) {
			return '';
		}

		return JSON.stringify(Object.fromEntries(entries), null, 2);
	}

	function splitPreambleAndBody(source: string): {
		preamble: string;
		body: string;
	} {
		const lines = source.split(/\r?\n/);
		let bodyStartIndex = lines.findIndex((line) => {
			const trimmedLine = line.trim();
			return trimmedLine.length > 0 && !preambleLinePattern.test(trimmedLine);
		});

		if (bodyStartIndex === -1) {
			bodyStartIndex = lines.length;
		}

		return {
			preamble: lines.slice(0, bodyStartIndex).join('\n').trim(),
			body: lines.slice(bodyStartIndex).join('\n').trim()
		};
	}

	let selectedExampleId = $state<TikzExampleId>(examples[0].id);
	let selectedExample = $derived(examples.find((candidate) => candidate.id === selectedExampleId) ?? examples[0]);
	let editorText = $state(examples[0].source);
	let texPackagesText = $state('');
	let tikzLibrariesText = $state('');
	let addToPreambleText = $state('');
	let normalizationNotes = $state<string[]>([]);
	let renderMessage = $state('');
	let renderState = $state<'idle' | 'rendering' | 'ready' | 'error'>('idle');
	let isPasting = $state(false);
	let isRuntimeReady = $state(false);
	let renderVersion = $state(0);
	let renderedRequest = $state<BrowserRenderRequest | null>(null);
	let renderHost = $state<HTMLDivElement | null>(null);

	function loadTikzjaxRuntime(): Promise<void> {
		if (typeof window === 'undefined') {
			return Promise.resolve();
		}

		const runtimeWindow = window as Window & {
			TikzJax?: boolean;
			__tikzjaxRuntimeReady?: Promise<unknown>;
		};
		const runtimeReadyPromise = runtimeWindow.__tikzjaxRuntimeReady;

		if (runtimeReadyPromise) {
			return runtimeReadyPromise.then(() => undefined);
		}

		if (tikzjaxRuntimePromise) {
			return tikzjaxRuntimePromise;
		}

		tikzjaxRuntimePromise = new Promise<void>((resolve, reject) => {
			const existingScript = document.getElementById(tikzjaxScriptId) as HTMLScriptElement | null;

			const resolveWhenRuntimeReady = () => {
				const currentRuntimeReadyPromise = runtimeWindow.__tikzjaxRuntimeReady;

				if (!currentRuntimeReadyPromise) {
					reject(new Error('TikZJax cargó el script principal, pero no expuso su promesa de inicialización.'));
					return;
				}

				currentRuntimeReadyPromise.then(() => resolve()).catch((error) => {
					reject(error instanceof Error ? error : new Error('No se pudo inicializar el runtime de TikZJax.'));
				});
			};

			if (existingScript) {
				existingScript.addEventListener('load', resolveWhenRuntimeReady, { once: true });
				existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar tikzjax.js.')), {
					once: true
				});

				if (runtimeWindow.TikzJax && runtimeWindow.__tikzjaxRuntimeReady) {
					resolveWhenRuntimeReady();
				}

				return;
			}

			const runtimeScript = document.createElement('script');
			runtimeScript.id = tikzjaxScriptId;
			runtimeScript.src = `${tikzjaxRuntimeBasePath}/tikzjax.js`;
			runtimeScript.async = true;
			runtimeScript.onload = resolveWhenRuntimeReady;
			runtimeScript.onerror = () => reject(new Error('No se pudo cargar tikzjax.js.'));
			document.head.append(runtimeScript);
		});

		return tikzjaxRuntimePromise;
	}

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
		renderMessage = '';
	}

	function prepareRenderRequest(): BrowserRenderRequest {
		const rawSource = editorText.trim();

		if (!rawSource) {
			throw new Error('Pega una fuente TikZ o TeX antes de renderizar.');
		}

		let source = rawSource;
		let detectedPackages: Record<string, string> = {};
		let detectedLibraries: string[] = [];
		let detectedPreamble = '';
		const notes: string[] = [];

		const documentMatch = rawSource.match(/([\s\S]*?)\\begin\{document\}([\s\S]*?)\\end\{document\}/);

		if (documentMatch) {
			const preamble = (documentMatch[1] ?? '').trim();
			source = (documentMatch[2] ?? '').trim();
			detectedPackages = extractPackagesFromPreamble(preamble);
			detectedLibraries = extractTikzLibrariesFromPreamble(preamble);
			detectedPreamble = cleanPreamble(preamble);
			notes.push('Se extrajo el contenido de \\begin{document}...\\end{document} para adaptarlo al runtime del navegador.');
		} else {
			const { preamble, body } = splitPreambleAndBody(rawSource);

			if (preamble) {
				source = body || source;
				detectedPackages = extractPackagesFromPreamble(preamble);
				detectedLibraries = extractTikzLibrariesFromPreamble(preamble);
				detectedPreamble = cleanPreamble(preamble);
				notes.push('Se extrajeron instrucciones de preámbulo iniciales sin necesidad de \\begin{document}.');
			}
		}

		const manualPackages = parsePackagesJson(texPackagesText);
		const mergedPackages = {
			...detectedPackages,
			...manualPackages
		};
		const mergedLibraries = unique([...detectedLibraries, ...splitCsv(tikzLibrariesText)]);
		const mergedPreamble = [detectedPreamble, addToPreambleText.trim()].filter(Boolean).join('\n');

		const unsupportedPackages = Object.keys(mergedPackages).filter(
			(packageName) => !supportedPackages.includes(packageName as (typeof supportedPackages)[number])
		);

		if (Object.keys(detectedPackages).length) {
			notes.push(`Paquetes detectados: ${Object.keys(detectedPackages).join(', ')}.`);
		}

		if (detectedLibraries.length) {
			notes.push(`Librerías detectadas: ${detectedLibraries.join(', ')}.`);
		}

		if (unsupportedPackages.length) {
			notes.push(`Paquetes fuera de la lista documentada del navegador: ${unsupportedPackages.join(', ')}.`);
		}

		normalizationNotes = notes;

		return {
			source,
			texPackagesJson: stringifyPackagesMap(mergedPackages),
			tikzLibraries: mergedLibraries.join(', '),
			addToPreamble: mergedPreamble,
			showConsole: true,
			disableCache: true,
			ariaLabel: 'Diagrama renderizado por TikZJax en el navegador',
			width: '420',
			height: '240'
		};
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
			renderMessage = error instanceof Error ? error.message : 'No se pudo preparar el diagrama.';
			renderState = 'error';
		}
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

	$effect(() => {
		if (!renderHost) {
			return;
		}

		const handleTikzRenderFinished = () => {
			renderState = 'ready';
			renderMessage = 'TikZJax terminó de generar el SVG en cliente.';
		};

		renderHost.addEventListener('tikzjax-load-finished', handleTikzRenderFinished);

		return () => {
			renderHost?.removeEventListener('tikzjax-load-finished', handleTikzRenderFinished);
		};
	});

	onMount(() => {
		void loadTikzjaxRuntime()
			.then(() => {
				isRuntimeReady = true;
				renderMessage = 'Runtime cargado e inicializado. Pulsa Renderizar En Cliente para compilar el diagrama.';
			})
			.catch((error) => {
				renderState = 'error';
				renderMessage = error instanceof Error ? error.message : 'No se pudo cargar TikZJax en el navegador.';
			});
	});
</script>

<svelte:head>
	<title>Demo TikZJax Browser</title>
	<link rel="stylesheet" href={`${tikzjaxRuntimeBasePath}/fonts.css`} />
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
						placeholder={"{\"pgfplots\":\"\",\"tikz-cd\":\"\"}"}
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
					<p class="mt-2 text-xs leading-5 text-slate-500">Se mapea a <code>data-tikz-libraries</code>.</p>
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

			<div class="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-6">
				{#if isRuntimeReady && renderedRequest}
					{#key renderVersion}
						<div bind:this={renderHost} class="tikzjax-scaled-container mx-auto min-h-56 max-w-4xl">
							<svelte:element
								this={'script'}
								type="text/tikz"
								data-aria-label={renderedRequest.ariaLabel}
								data-width={renderedRequest.width}
								data-height={renderedRequest.height}
								data-show-console={String(renderedRequest.showConsole)}
								data-disable-cache={String(renderedRequest.disableCache)}
								data-tex-packages={renderedRequest.texPackagesJson || undefined}
								data-tikz-libraries={renderedRequest.tikzLibraries || undefined}
								data-add-to-preamble={renderedRequest.addToPreamble || undefined}
							>{renderedRequest.source}</svelte:element>
						</div>
					{/key}
				{:else}
					<div class="flex min-h-56 items-center justify-center text-sm text-slate-500">
						{isRuntimeReady ? 'Pulsa Renderizar En Cliente para generar el SVG.' : 'Cargando runtime de TikZJax...'}
					</div>
				{/if}
			</div>

			<div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
				<h3 class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Bloque enviado a TikZJax</h3>
				<pre class="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-emerald-200">{renderedRequest?.source ?? 'Sin render todavía.'}</pre>
				<div class="mt-4 grid gap-3 text-xs leading-6 text-slate-600 md:grid-cols-3">
					<div class="rounded-2xl bg-white p-3">
						<p class="font-semibold text-slate-900">Paquetes</p>
						<pre class="mt-2 overflow-x-auto text-[11px] leading-5">{renderedRequest?.texPackagesJson || 'Ninguno'}</pre>
					</div>
					<div class="rounded-2xl bg-white p-3">
						<p class="font-semibold text-slate-900">Librerías</p>
						<p class="mt-2 break-all">{renderedRequest?.tikzLibraries || 'Ninguna'}</p>
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