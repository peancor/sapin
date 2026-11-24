<script lang="ts">
	import ConversationTranscript from '$lib/components/conversation/ConversationTranscript.svelte';
	import ConversationActions from '$lib/components/conversation/ConversationActions.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.title} · Sapin</title></svelte:head>
<main class="mx-auto max-w-4xl bg-white px-5 py-6 text-slate-900 print:max-w-none print:p-0">
	<div class="mb-4 print:hidden">
		<ConversationActions ilid={data.ilid} cid={data.cid} showReview={false} />
	</div>
	<ConversationTranscript
		classic={data.classic}
		messages={data.messages}
		title={data.title}
		createdAt={data.createdAt}
	/>
</main>
