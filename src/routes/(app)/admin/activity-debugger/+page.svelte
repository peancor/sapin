<script lang="ts">
	import ActivityDebuggerExplorer from '$lib/components/activity-debugger/ActivityDebuggerExplorer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ActivityDebuggerExplorer
	title="Depurador global de actividades IA"
	subtitle="Explora actividades chat y agent, detecta incidencias y entra hasta el nivel de sesión con toda la telemetría disponible."
	activities={data.activities}
	courses={data.courses}
	filters={data.filters}
/>
