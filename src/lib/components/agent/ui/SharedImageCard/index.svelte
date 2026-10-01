<script lang="ts">
	interface Props {
		instanceId: string;
		resourceId: string;
		fileId: string;
		name: string;
		mimeType: string;
		title?: string;
		caption?: string;
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score?: number) => void;
	}

	let { instanceId, resourceId, fileId, name, mimeType, title, caption }: Props = $props();

	let isPreviewOpen = $state(false);
	let imageFailed = $state(false);

	const imageUrl = $derived(`/api/files/${encodeURIComponent(fileId)}`);
	const displayTitle = $derived(title?.trim() || name);
	const altText = $derived(caption?.trim() || title?.trim() || name || 'Imagen compartida');
	const mimeBadge = $derived(
		mimeType.startsWith('image/') ? mimeType.replace('image/', '').toUpperCase() : 'IMAGE'
	);

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

	function openOriginalFile() {
		window.open(imageUrl, '_blank', 'noopener,noreferrer');
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div
	class="my-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
	data-instance-id={instanceId}
	data-resource-id={resourceId}
>
	<div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
		<div class="flex min-w-0 items-center gap-2">
			<svg class="h-4 w-4 shrink-0 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 16l4.5-4.5a2 2 0 012.8 0L16 16m-1-1 1.5-1.5a2 2 0 012.8 0L20 14m-14 6h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
				/>
			</svg>
			<span class="truncate text-sm font-semibold text-gray-900 dark:text-white">{displayTitle}</span>
		</div>
		<span
			class="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
		>
			{mimeBadge}
		</span>
	</div>

	<div class="px-3 py-3 sm:px-4">
		{#if imageFailed}
			<div
				class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
			>
				No se pudo cargar la imagen.
				<button type="button" onclick={openOriginalFile} class="ml-1 underline">Abrir archivo</button>
			</div>
		{:else}
			<button
				type="button"
				class="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
				onclick={openPreview}
				aria-label="Ampliar imagen"
			>
				<img
					src={imageUrl}
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
				<img
					src={imageUrl}
					alt={altText}
					class="max-h-[90vh] w-full rounded-lg object-contain"
				/>
				{#if caption?.trim()}
					<p class="mt-2 text-center text-xs text-gray-200">{caption}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
