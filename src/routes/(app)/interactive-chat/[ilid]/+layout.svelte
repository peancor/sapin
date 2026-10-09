<script lang="ts">
	import { type Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import '$lib/stores/navigation';

	let { children }: { data: LayoutData; children: Snippet } = $props();
</script>

{@render children()}
