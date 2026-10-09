<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import '$lib/components/CourseMenu.svelte';

	let { children }: { data: LayoutData; children: Snippet } = $props();
</script>

<!-- <CourseMenu courseId={data.course.id} /> -->
{@render children()}
