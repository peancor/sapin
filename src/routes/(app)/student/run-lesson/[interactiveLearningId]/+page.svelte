<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		if (data.sessionId && data.courseId) {
			goto(`/course/${data.courseId}/run/lesson/${data.sessionId}`, { invalidateAll: true });
		}
	});
</script>

<p>Preparando lesson...</p>
