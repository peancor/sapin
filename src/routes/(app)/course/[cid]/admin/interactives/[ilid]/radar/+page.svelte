<script lang="ts">
	import RadarDashboard from '$lib/components/radar/RadarDashboard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#key `${data.course.id}:${data.interactive.id}`}
	<RadarDashboard {data} />
{/key}
