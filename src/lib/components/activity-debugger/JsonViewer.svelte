<script lang="ts">
	import { browser } from '$app/environment';
	import { Copy, Check } from 'lucide-svelte';

	interface Props {
		value: unknown;
		heightClass?: string;
	}

	let { value, heightClass = 'max-h-96' }: Props = $props();
	let copied = $state(false);

	function formatValue(input: unknown): string {
		if (input === null || input === undefined) return 'null';
		if (typeof input === 'string') return input;

		try {
			return JSON.stringify(input, null, 2);
		} catch {
			return String(input);
		}
	}

	async function copyToClipboard() {
		if (!browser) return;
		try {
			await navigator.clipboard.writeText(formatValue(value));
			copied = true;
			window.setTimeout(() => {
				copied = false;
			}, 1200);
		} catch {
			copied = false;
		}
	}
</script>

<div class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-slate-800">
	<div class="flex items-center justify-between border-b border-white/10 px-3 py-2">
		<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Raw</p>
		<button
			type="button"
			class="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-sky-500/40 hover:text-sky-200"
			onclick={copyToClipboard}
		>
			{#if copied}
				<Check class="h-3.5 w-3.5" />
				Copiado
			{:else}
				<Copy class="h-3.5 w-3.5" />
				Copiar
			{/if}
		</button>
	</div>
	<pre class={`overflow-auto px-4 py-4 text-xs text-slate-100 ${heightClass}`}>{formatValue(value)}</pre>
</div>
