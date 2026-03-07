<script lang="ts">
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';

	interface HudItem {
		label: string;
		value: string;
	}

	interface Props {
		hudItems?: HudItem[];
		portraitPreferred?: boolean;
		portraitHint?: string;
		showCanvas?: boolean;
		onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
		children?: Snippet;
		controls?: Snippet;
		footer?: Snippet;
	}

	let {
		hudItems = [],
		portraitPreferred = false,
		portraitHint = 'Para esta tarea se recomienda girar el dispositivo a horizontal.',
		showCanvas = true,
		onCanvasReady,
		children,
		controls,
		footer
	}: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let isPortrait = $state(false);

	function refreshOrientation() {
		if (!browser) return;
		isPortrait = window.innerHeight > window.innerWidth;
	}

	$effect(() => {
		onCanvasReady?.(canvas);
	});

	$effect(() => {
		if (!browser) return;
		refreshOrientation();
		window.addEventListener('resize', refreshOrientation);
		return () => window.removeEventListener('resize', refreshOrientation);
	});
</script>

<div class="flex min-h-[76vh] flex-col gap-4">
	{#if hudItems.length > 0}
		<div class="grid gap-3 sm:grid-cols-4">
			{#each hudItems as item (item.label)}
				<div class="rounded-3xl border border-white/10 bg-white/6 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{item.label}</p>
					<p class="mt-2 text-2xl font-black">{item.value}</p>
				</div>
			{/each}
		</div>
	{/if}

	<div class="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/25 shadow-xl">
		{#if portraitPreferred && isPortrait}
			<div class="border-b border-amber-300/20 bg-amber-500/12 px-4 py-3 text-sm text-amber-100">
				{portraitHint}
			</div>
		{/if}

		<div class="relative aspect-[16/10] min-h-[360px] w-full sm:min-h-[440px]">
			{#if showCanvas}
				<canvas bind:this={canvas} class="absolute inset-0 h-full w-full"></canvas>
			{/if}
			<div class="absolute inset-0">
				{@render children?.()}
			</div>
		</div>
	</div>

	{#if controls}
		<div>{@render controls()}</div>
	{/if}

	{#if footer}
		<div>{@render footer()}</div>
	{/if}
</div>
