<script lang="ts">
	import { sanitizeHtml } from '$lib/utils/sanitizeHtml';
	let { html }: { html: string } = $props();
	const sanitized = $derived(sanitizeHtml(html));
</script>

<!-- Only this boundary may insert HTML: sanitize the final value on both SSR and client. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html sanitized}
