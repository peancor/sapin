<script lang="ts">
	import type { LayoutData } from './$types';
	import CourseRunTopbar from '$lib/components/CourseRunTopbar.svelte';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	function handleMenuToggle() {
		// No-op since we don't have a menu anymore
	}
</script>

<div class="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
	<CourseRunTopbar course={data.course} user={data.user} onMenuToggle={handleMenuToggle} />
	<main class="flex-1 overflow-auto pt-16 md:pt-20 p-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700">
		{@render children()}
	</main>
</div>
