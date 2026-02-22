<script lang="ts">
	import type { PageData } from './$types';
	import ChatComponent from '$lib/components/ChatComponent.svelte';
	
	let { data }: { data: PageData } = $props();

	// Map the messages to the format expected by ChatComponent
	const mappedMessages = $derived(() =>
		data.messages.map((msg) => ({
			content: msg.content,
			type: msg.type.toLowerCase() === 'user' ? ('user' as const) : ('assistant' as const)
		}))
	);

	// Extract just the username for the chat component	
	//usamos el alias y si no hay el username y si no pues anonimo
	const chatUser = $derived(() =>
		data.user ? { username: data.user.alias || data.user.username || 'Anónimo' } : undefined
	);
	console.log((() => chatUser())());
	
</script>

<div class="h-[calc(100vh-128px)]">
	<ChatComponent
		initialMessages={mappedMessages()}
		apiEndpoint={`/api/interactive-chat/${data.chat.id}/chat/${data.chatInstance}/ask`}
		user={chatUser()}
	/>
</div>
