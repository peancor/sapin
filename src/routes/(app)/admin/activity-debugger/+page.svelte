<script lang="ts">
	import { resolve } from '$app/paths';
	import { Settings2 } from 'lucide-svelte';
	import ActivityDebuggerExplorer from '$lib/components/activity-debugger/ActivityDebuggerExplorer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-4">
	<div class="flex justify-end">
		<a
			href={resolve('/admin/activity-debugger/settings')}
			class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-sky-800 dark:hover:text-sky-300"
		>
			<Settings2 class="h-4 w-4" />
			Settings de captura
		</a>
	</div>

	<ActivityDebuggerExplorer
		title="Depurador global de actividades IA"
		subtitle="Explora actividades chat y agent, detecta incidencias y entra hasta el nivel de sesión con toda la telemetría disponible."
		activities={data.activities}
		courses={data.courses}
		filters={data.filters}
	/>
</div>
