<script lang="ts">
	import { buildSvgDataUri } from '$lib/utils/svgDiagram';

	interface Props {
		instanceId: string;
		svg: string;
		title?: string;
		caption?: string;
		ariaLabel?: string;
		notes?: string[];
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score?: number) => void;
	}

	let { instanceId, svg, title, caption, ariaLabel, notes = [] }: Props = $props();

	let isPreviewOpen = $state(false);
	let imageFailed = $state(false);

	const svgSrc = $derived(buildSvgDataUri(svg));
	const displayTitle = $derived(title?.trim() || 'Diagrama SVG');
	const altText = $derived(
		ariaLabel?.trim() || caption?.trim() || title?.trim() || 'Diagrama SVG generado por el agente'
	);
	const filteredNotes = $derived(notes.filter((note) => note.trim().length > 0));

	function openPreview() {
		if (imageFailed) return;
		isPreviewOpen = true;
	}

	function closePreview() {
		isPreviewOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isPreviewOpen) {
			closePreview();
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

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
					d="M4 19V5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1zm3-3l3-4 3 3 4-5"
				/>
			</svg>
			<span class="truncate text-sm font-semibold text-gray-900 dark:text-white">{displayTitle}</span>
		</div>
		<span
			class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
		>
			SVG
		</span>
	</div>

	<div class="px-3 py-3 sm:px-4">
		{#if imageFailed}
			<div
				class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
			>
				No se pudo cargar el SVG renderizado.
			</div>
		{:else}
			<button
				type="button"
				class="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
				onclick={openPreview}
				aria-label="Ampliar diagrama SVG"
			>
				<img
					src={svgSrc}
					alt={altText}
					loading="lazy"
					decoding="async"
					onerror={() => (imageFailed = true)}
					class="h-auto max-h-[min(65vh,520px)] w-full object-contain"
				/>
			</button>
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

			<pre class="mt-3 overflow-x-auto rounded-lg bg-white p-3 leading-5 text-gray-700 dark:bg-gray-950 dark:text-gray-200">{svg}</pre>
		</details>
	</div>
</div>

{#if isPreviewOpen}
	<div class="fixed inset-0 z-[100] bg-black/85 p-3 sm:p-6">
		<button
			type="button"
			class="absolute inset-0 h-full w-full cursor-default"
			onclick={closePreview}
			aria-label="Cerrar vista ampliada"
		></button>
		<div class="relative mx-auto flex h-full max-w-6xl items-center justify-center">
			<div class="relative z-10 w-full">
				<button
					type="button"
					class="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white"
					onclick={closePreview}
					aria-label="Cerrar vista ampliada"
				>
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
				<img src={svgSrc} alt={altText} class="max-h-[90vh] w-full rounded-lg object-contain" />
				{#if caption?.trim()}
					<p class="mt-2 text-center text-xs text-gray-200">{caption}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
