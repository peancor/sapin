<script lang="ts">
	import { browser } from '$app/environment';
	import { X } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		subtitle?: string;
		canCloseSafely?: boolean;
		closePrompt?: string;
		onclose?: () => void;
		children?: Snippet;
	}

	let {
		open,
		title,
		subtitle,
		canCloseSafely = true,
		closePrompt = 'Si sales ahora se perdera el progreso no enviado. ¿Quieres cerrar?',
		onclose,
		children
	}: Props = $props();

	let closeButton: HTMLButtonElement | null = $state(null);

	async function requestClose() {
		if (!canCloseSafely && !window.confirm(closePrompt)) return;
		onclose?.();
	}

	function handleDocumentKeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;
		event.preventDefault();
		void requestClose();
	}

	$effect(() => {
		if (!browser || !open) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		queueMicrotask(() => closeButton?.focus());

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});
</script>

<svelte:document onkeydown={handleDocumentKeydown} />

{#if open}
	<div class="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-md">
		<div class="flex h-full flex-col">
			<div
				class="border-b border-white/10 bg-slate-950/80 px-4 py-4 text-white sm:px-6"
				role="dialog"
				aria-modal="true"
				aria-labelledby="immersive-tool-title"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
							Experiencia inmersiva
						</p>
						<h2 id="immersive-tool-title" class="mt-1 text-xl font-semibold sm:text-2xl">
							{title}
						</h2>
						{#if subtitle}
							<p class="mt-1 max-w-3xl text-sm text-slate-300 sm:text-base">{subtitle}</p>
						{/if}
					</div>

					<button
						bind:this={closeButton}
						type="button"
						class="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-slate-200 transition-colors hover:bg-white/10"
						aria-label="Cerrar experiencia inmersiva"
						onclick={() => void requestClose()}
					>
						<X class="h-5 w-5" />
					</button>
				</div>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto">
				<div class="mx-auto h-full w-full max-w-7xl px-3 py-3 sm:px-6 sm:py-6">
					{@render children?.()}
				</div>
			</div>
		</div>
	</div>
{/if}
