<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import MoodleActivityLinkVerificationPanel from '$lib/components/MoodleActivityLinkVerificationPanel.svelte';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		if (data.moodleLinkVerification) return;

		if (data.sessionId && data.courseId) {
			goto(resolve(`/course/${data.courseId}/run/lesson/${data.sessionId}`), {
				invalidateAll: true
			});
		}
	});
</script>

{#if data.moodleLinkVerification}
	<MoodleActivityLinkVerificationPanel verification={data.moodleLinkVerification} />
{:else}
	<p>Preparando lesson...</p>
{/if}
