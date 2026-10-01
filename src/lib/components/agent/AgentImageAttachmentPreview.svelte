<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { ExternalLink, X } from 'lucide-svelte';
	import type { AgentDisplayPart } from '$lib/types/agent';

	type ImageAttachmentPart = Extract<AgentDisplayPart, { kind: 'image' }>;

	interface Props {
		attachment: ImageAttachmentPart;
		variant?: 'chat-user' | 'chat-assistant' | 'review';
	}

	let { attachment, variant = 'review' }: Props = $props();

	let isPreviewOpen = $state(false);
	let imageFailed = $state(false);
	let closeButton: HTMLButtonElement | null = $state(null);

	const imageUrl = $derived(resolve('/api/files/[fileId]', { fileId: attachment.fileId }));
	const altText = $derived(attachment.displayName ?? 'Imagen adjunta');
	const imageWidth = $derived(attachment.width ?? 320);
	const imageHeight = $derived(attachment.height ?? 240);
	const previewChromeClass = $derived(
		variant === 'chat-user'
			? 'border-white/30 bg-white/10 hover:bg-white/15 focus-visible:ring-white/80'
			: 'border-slate-200 bg-slate-50 hover:bg-slate-100 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900'
	);
	const previewSizeClass = $derived(
		variant === 'review' ? 'max-h-64 max-w-xs' : 'max-h-56 max-w-sm'
	);

	async function openPreview() {
		if (imageFailed) return;
		isPreviewOpen = true;
		await tick();
		closeButton?.focus();
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

{#if imageFailed}
	<a
		class="mt-2 inline-flex rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-red-800 dark:bg-red-950 dark:text-red-300"
		href={resolve('/api/files/[fileId]', { fileId: attachment.fileId })}
		target="_blank"
		rel="noopener noreferrer"
	>
		No se pudo cargar la imagen
	</a>
{:else}
	<button
		type="button"
		class={`mt-2 inline-flex max-w-full cursor-zoom-in overflow-hidden rounded-lg border ${previewChromeClass} focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none`}
		onclick={openPreview}
		aria-label={`Ampliar ${altText}`}
	>
		<img
			src={imageUrl}
			alt={altText}
			width={imageWidth}
			height={imageHeight}
			loading="lazy"
			decoding="async"
			onerror={() => (imageFailed = true)}
			class={`block h-auto max-w-full object-contain ${previewSizeClass}`}
		/>
	</button>
{/if}

{#if isPreviewOpen}
	<div
		class="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/85 p-3 sm:p-6"
		role="dialog"
		aria-modal="true"
		aria-label={altText}
	>
		<button
			type="button"
			class="fixed inset-0 h-full w-full cursor-default"
			onclick={closePreview}
			aria-label="Cerrar vista ampliada"
		></button>

		<div class="relative mx-auto flex min-h-full max-w-7xl items-center justify-center">
			<div class="relative z-10 w-full">
				<div class="absolute top-2 right-2 z-20 flex gap-2">
					<a
						class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
						href={resolve('/api/files/[fileId]', { fileId: attachment.fileId })}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Abrir imagen en nueva pestana"
					>
						<ExternalLink class="h-4 w-4" aria-hidden="true" />
					</a>
					<button
						bind:this={closeButton}
						type="button"
						class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
						onclick={closePreview}
						aria-label="Cerrar vista ampliada"
					>
						<X class="h-5 w-5" aria-hidden="true" />
					</button>
				</div>

				<img
					src={imageUrl}
					alt={altText}
					width={imageWidth}
					height={imageHeight}
					class="mx-auto max-h-[88vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
				/>
				{#if attachment.displayName}
					<p class="mt-3 truncate text-center text-xs text-slate-200">{attachment.displayName}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
