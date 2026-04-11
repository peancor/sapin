<script lang="ts">
	import type { PageData } from './$types';
	import StaffAgentSettings from '$lib/components/staff-agent/StaffAgentSettings.svelte';

	let { data }: { data: PageData } = $props();
</script>

<StaffAgentSettings
	scopeLabel={data.scopeLabel}
	returnHref={data.returnHref}
	updateEndpoint={data.updateEndpoint}
	models={data.models}
	availableTools={data.availableTools}
	workspace={data.workspace}
/>
