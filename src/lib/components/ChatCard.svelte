<script lang="ts">
	import { formatDate } from '$lib/helpers/dateUtils';
	import { ChevronDown, ChevronUp, MessageSquare, ExternalLink } from 'lucide-svelte';
	import type { ChatInstanceInterface, InteractiveChatInterface } from '$lib/server/db/';
	import { Avatar, Badge } from 'flowbite-svelte';
	import { marked } from 'marked';
	import katex from 'katex';
	import markedKatex from 'marked-katex-extension';
	import 'katex/dist/katex.min.css';
	import { preprocessMathExpressions } from '$lib/utils';
	import { resolve } from '$app/paths';

	marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

	export let interactiveChat: InteractiveChatInterface;
	export let chatInstance: ChatInstanceInterface;

	let isExpanded = false;

	// Get a short excerpt from the chat messages (first user or assistant message)
	$: excerpt = chatInstance.messages.find((m) => m.type === 'ASSISTANT')
		? chatInstance.messages.find((m) => m.type === 'ASSISTANT')?.content.slice(0, 150) + '...'
		: chatInstance.messages.find((m) => m.type === 'USER')?.content.slice(0, 150) + '...';

	// Count messages by type
	$: messageCount = {
		user: chatInstance.messages.filter((m) => m.type === 'USER').length,
		assistant: chatInstance.messages.filter((m) => m.type === 'ASSISTANT').length
	};

	// Get the last message from the chat for the date display
	$: lastMessage =
		chatInstance.messages.length > 0
			? chatInstance.messages.reduce(
					(latest, current) =>
						new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest,
					chatInstance.messages[0]
				)
			: null;

	function toggleExpand() {
		isExpanded = !isExpanded;
	}

	function processThinkTags(content: string) {
		return content.replace(/<think>(.*?)<\/think>/gs, '<div class="think-block">$1</div>');
	}

	function processContent(content: string) {
		// First preprocess math expressions
		const mathProcessed = preprocessMathExpressions(content);
		// Then process think tags
		return processThinkTags(mathProcessed);
	}
</script>

<div
	class="mb-4 rounded-lg bg-white p-3 shadow-md transition-shadow duration-300 hover:shadow-lg sm:p-4 dark:bg-gray-800"
>
	<!-- Contenedor principal con evento click -->
	<div
		role="button"
		tabindex="0"
		class="flex cursor-pointer flex-col items-start gap-3 sm:flex-row sm:gap-4"
		on:click={toggleExpand}
		on:keydown={(e) => e.key === 'Enter' && toggleExpand()}
	>
		<!-- Avatar y información del usuario -->
		<Avatar
			src={chatInstance.user.image || '/images/default_avatar.png'}
			cornerStyle="rounded"
			size="md"
			class="hidden sm:block"
		/>

		<div class="w-full flex-grow">
			<!-- Cabecera con título y badges -->
			<div class="mb-2 flex flex-wrap items-center gap-2">
				<h3 class="text-base font-semibold break-words sm:text-lg dark:text-white">
					{interactiveChat.interactive_learning.name || 'Untitled Chat'}
				</h3>
				<div class="flex flex-wrap gap-1">
					<Badge color="blue" class="text-xs">{messageCount.user} mensajes</Badge>
					<Badge color="green" class="text-xs">{messageCount.assistant} respuestas</Badge>
				</div>
			</div>

			<!-- Información del usuario y fecha -->
			<div
				class="mb-3 flex flex-wrap items-center gap-1 text-xs text-gray-500 sm:gap-2 sm:text-sm dark:text-gray-400"
			>
				<span class="font-medium">{chatInstance.user.username}</span>
				{#if chatInstance.user.email}
					<span class="hidden sm:inline">•</span>
					<span class="max-w-[150px] truncate sm:max-w-none">{chatInstance.user.email}</span>
				{/if}
				{#if chatInstance.user.alias}
					<span class="hidden sm:inline">•</span>
					<span class="max-w-[100px] truncate italic sm:max-w-none"
						>({chatInstance.user.alias})</span
					>
				{/if}
				<span class="hidden sm:inline">•</span>
				<span
					>{lastMessage
						? formatDate(lastMessage.createdAt)
						: formatDate(interactiveChat.interactive_learning_chat.createdAt)}</span
				>
			</div>

			<!-- Preview del mensaje cuando está colapsado -->
			{#if !isExpanded}
				<div
					class="markdown prose dark:prose-invert line-clamp-3 max-w-none text-xs text-gray-600 sm:line-clamp-2 sm:text-sm dark:text-gray-400"
				>
					{@html marked(processContent(excerpt || ''))}
				</div>
				<div
					class="mt-2 flex items-center justify-between text-xs text-blue-600 dark:text-blue-400"
				>
					<div class="flex items-center">
						<ChevronDown class="mr-1 h-3 w-3" />
						<span>Expandir para ver el chat completo</span>
					</div>
					<a
						href={resolve(`${("/interactive-chat")}/${interactiveChat.interactive_learning_chat.id}/view/${chatInstance.chat.id}`)}
						class="flex items-center hover:underline"
						on:click|stopPropagation
					>
						<ExternalLink class="mr-1 h-3 w-3" />
						<span>Ver chat completo</span>
					</a>
				</div>
			{/if}
		</div>

		<!-- Botón expandir/contraer -->
		<button
			class="absolute top-3 right-3 rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
			aria-label={isExpanded ? 'Collapse chat' : 'Expand chat'}
			on:click|stopPropagation={() => toggleExpand()}
		>
			{#if isExpanded}
				<ChevronUp class="h-4 w-4 sm:h-5 sm:w-5" />
			{:else}
				<ChevronDown class="h-4 w-4 sm:h-5 sm:w-5" />
			{/if}
		</button>
	</div>

	<!-- Mensajes expandidos -->
	{#if isExpanded}
		<div class="mt-4 space-y-3">
			{#each chatInstance.messages as message ( message.id )}
				<div
					class="rounded-lg p-2 sm:p-3 {message.type === 'USER'
						? 'ml-2 bg-blue-50 sm:ml-4 dark:bg-blue-900/30'
						: message.type === 'ASSISTANT'
							? 'mr-2 bg-gray-50 sm:mr-4 dark:bg-gray-700/30'
							: 'bg-yellow-50 dark:bg-yellow-900/30'}"
				>
					<p
						class="mb-1 text-xs font-medium {message.type === 'SYSTEM'
							? 'text-yellow-600 dark:text-yellow-400'
							: message.type === 'USER'
								? 'text-blue-600 dark:text-blue-400'
								: 'text-gray-600 dark:text-gray-400'}"
					>
						{message.type.charAt(0).toUpperCase() + message.type.slice(1).toLowerCase()}
					</p>
					<div
						class="markdown prose prose-sm sm:prose dark:prose-invert max-w-none break-words text-gray-700 dark:text-gray-300"
					>
						{@html marked(processContent(message.content))}
					</div>
				</div>
			{/each}
			<div class="mt-4 flex items-center justify-between">
				<a
					href={resolve(`${("/interactive-chat")}/${interactiveChat.interactive_learning_chat.id}/view/${chatInstance.chat.id}`)}
					class="flex items-center p-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
					on:click|stopPropagation
				>
					<ExternalLink class="mr-1 h-3 w-3" />
					<span>Ver chat completo</span>
				</a>
				<button
					class="flex items-center p-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
					on:click|stopPropagation={() => toggleExpand()}
				>
					<ChevronUp class="mr-1 h-3 w-3" />
					<span>Contraer chat</span>
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.markdown :global(h1) {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-color);
	}

	.markdown :global(p) {
		color: var(--text-color);
	}

	.markdown :global(a) {
		text-decoration: underline;
		color: var(--link-color);
		word-break: break-word;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		padding-left: 1.25rem;
		color: var(--text-color);
	}

	.markdown :global(ul) {
		list-style-type: disc;
	}

	.markdown :global(ol) {
		list-style-type: decimal;
	}

	.markdown :global(code) {
		border-radius: 0.25rem;
		background-color: var(--code-bg);
		padding: 0.125rem 0.25rem;
		word-break: break-word;
	}

	.markdown :global(pre) {
		overflow-x: auto;
		border-radius: 0.25rem;
		background-color: var(--code-bg);
		padding: 0.75rem;
	}

	.markdown :global(pre code) {
		white-space: pre-wrap;
		word-break: break-word;
	}

	.markdown :global(img) {
		max-width: 100%;
		height: auto;
	}

	.markdown {
		transition: min-height 0.3s ease;
	}

	.markdown :global(.think-block) {
		margin: 0.5rem 0;
		border-radius: 0.5rem;
		border-left: 4px solid var(--accent-color);
		background-color: var(--think-bg);
		padding: 0.5rem;
		font-style: italic;
		color: var(--text-color);
	}

	:global(.dark) .markdown :global(.think-block) {
		background-color: rgba(91, 33, 182, 0.3);
		color: rgb(243, 244, 246);
	}

	/* Line clamp utilities */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	:root {
		--text-color: #111827;
		--link-color: #3b82f6;
		--code-bg: #f3f4f6;
		--accent-color: #8b5cf6;
		--think-bg: #ede9fe;
	}

	:global(.dark) {
		--text-color: #f3f4f6;
		--link-color: #60a5fa;
		--code-bg: #374151;
		--accent-color: #a78bfa;
		--think-bg: rgba(91, 33, 182, 0.3);
	}
</style>
