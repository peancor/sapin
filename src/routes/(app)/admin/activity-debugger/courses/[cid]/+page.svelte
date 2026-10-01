<script lang="ts">
	import ActivityDebuggerExplorer from '$lib/components/activity-debugger/ActivityDebuggerExplorer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ActivityDebuggerExplorer
	title={`Depurador IA del curso ${data.lockedCourse.name}`}
	subtitle="Vista filtrada por curso para recorrer actividades y saltar directamente a sesiones problemáticas."
	activities={data.activities}
	courses={data.courses}
	filters={data.filters}
	lockedCourse={data.lockedCourse}
/>
