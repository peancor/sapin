<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { Button } from 'flowbite-svelte';
	import { ArrowLeft } from 'lucide-svelte';
	import ChatComponent from '$lib/components/ChatComponent.svelte';
	import { resolve } from '$app/paths';

	import { onMount } from 'svelte';
	import { response } from '$lib/stores/response';
	

	let { data }: { data: PageData } = $props();

	// Map the messages to the format expected by ChatComponent
	const mappedMessages = $derived(() =>
		data.messages.map((msg) => ({
			content: msg.content,
			type: msg.type.toLowerCase() === 'user' ? ('user' as const) : ('assistant' as const)
		}))
	);

	// Extract just the username for the chat component
	//const chatUser = data.user ? { username: data.user.username || 'Anónimo' } : undefined;
	const chatUser = $derived(() =>
		data.user ? { username: data.user.alias || data.user.username || 'Anónimo' } : undefined
	);


	onMount(() => {
/* 		// Initialize with a system message if needed
		if (data.activity?.content?.systemPrompt) {
			messages = [{ content: data.activity.content.systemPrompt, type: 'assistant' }];
		} */
	});

	function goBackToCourse() {
		goto(resolve(`/course/${data.course.id}/run`));
	}
</script>

<div class="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
	<!-- Header -->
	<div class="border-b bg-white dark:bg-gray-800 shadow-sm">
		<div class="px-4 py-4">
			<div class="flex items-center justify-between">
				<Button color="light" class="flex items-center gap-2" onclick={goBackToCourse}>
					<ArrowLeft class="h-4 w-4" />
					Volver al curso
				</Button>
				<div class="text-right">
					<h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {data.interactiveLearning?.name || 'Chat'}
          </h1>
					{#if data.interactiveLearning?.description}
						<p class="text-sm text-gray-600 dark:text-gray-300">
              {data.interactiveLearning.description}
            </p>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Chat Container -->
	<div class="flex-1 overflow-hidden">
		<ChatComponent
			initialMessages={mappedMessages()}
			apiEndpoint={`/api/interactive-chat/${data.interactiveLearningChat?.id}/chat/${data.chatId}/ask`}
			user={chatUser()}
		/>
	</div>
</div>
