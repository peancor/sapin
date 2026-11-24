<script lang="ts">
	import { resolve } from '$app/paths';
	import { Download, BookOpen } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	let {
		ilid,
		cid,
		showReview = true
	}: { ilid: string; cid: string; showReview?: boolean } = $props();

	let busy = $state(false);
	let failed = $state(false);
	async function download(event: MouseEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		failed = false;
		try {
			const response = await fetch((event.currentTarget as HTMLAnchorElement).href);
			if (!response.ok || response.headers.get('content-type') !== 'application/pdf') throw Error();
			const objectUrl = URL.createObjectURL(await response.blob());
			const link = document.createElement('a');
			link.href = objectUrl;
			const encodedName = response.headers
				.get('content-disposition')
				?.match(/filename\*=UTF-8''(.+)$/i)?.[1];
			link.download = encodedName ? decodeURIComponent(encodedName) : 'conversation.pdf';
			link.click();
			setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<nav
	class="flex flex-wrap items-center gap-x-4 gap-y-1 py-1 text-sm print:hidden"
	aria-label={m.conversation_actions()}
>
	{#if showReview}<a
			class="inline-flex items-center gap-1.5 underline"
			href={resolve('/conversation/[ilid]/[cid]', { ilid, cid })}
			><BookOpen size={16} />{m.conversation_review()}</a
		>{/if}
	<a
		class="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 font-medium text-white hover:bg-sky-800"
		href={resolve('/api/conversation/[ilid]/[cid]/pdf', { ilid, cid })}
		download
		onclick={download}
		aria-busy={busy}
		><Download size={16} />{busy ? m.conversation_busy() : m.conversation_download()}</a
	>
	{#if failed}<span role="alert">{m.conversation_failure()}</span>{#if !showReview}<button
				type="button"
				class="underline"
				onclick={() => window.print()}>{m.conversation_print()}</button
			>{/if}{/if}
</nav>
