<script lang="ts">
	import type { PageData } from './$types';
	import StaffAgentWorkspace from '$lib/components/staff-agent/StaffAgentWorkspace.svelte';

	let { data }: { data: PageData } = $props();
</script>

<StaffAgentWorkspace
	title={data.title}
	description={data.description}
	workspace={data.workspace}
	threads={data.threads}
	selectedThread={data.selectedThread}
	apiBasePath={data.apiBasePath}
	settingsHref={data.settingsHref}
	newThreadLabel={data.newThreadLabel}
	viewerUser={data.viewerUser}
/>
