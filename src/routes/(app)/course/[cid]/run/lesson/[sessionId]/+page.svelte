<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	import LessonRuntimePanel from '$lib/components/lesson/LessonRuntimePanel.svelte';

	let { data }: { data: PageData } = $props();
</script>

<LessonRuntimePanel
	{data}
	backHref={resolve(`/course/${data.session.courseId}/run`)}
	backLabel="Volver al curso"
	showOverview={false}
/>
