<script lang="ts">
	import type { PageData } from './$types';
	import AgenticInsightsWorkspace from './AgenticInsightsWorkspace.svelte';

	let { data }: { data: PageData } = $props();
</script>

<AgenticInsightsWorkspace {data} />
