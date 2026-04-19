<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { renderMarkdownMath } from '$lib/utils';
	import type { LessonAgentConfig } from '$lib/types/lesson';
	import { SendHorizontal } from 'lucide-svelte';
	import { onDestroy, tick } from 'svelte';

	interface LessonAgentChatMessage {
		id: string;
		type: 'USER' | 'ASSISTANT';
		content: string;
	}

	interface LessonAgentChatState {
		userTurnCount: number;
		assistantTurnCount: number;
		hasUserResponse: boolean;
		hasGeneratedResponse: boolean;
		isStreaming: boolean;
	}

	interface Props {
		initialMessages?: Array<{ id: string; type: string; content: string }>;
		activityId: string;
		sessionId: string;
		blockId: string;
		visitId: string | null;
		agentConfig: LessonAgentConfig;
		canInteract: boolean;
		isReadOnly: boolean;
		initialHasGeneratedResponse: boolean;
		onStateChange?: (state: LessonAgentChatState) => void;
	}

	let {
		initialMessages = [],
		activityId,
		sessionId,
		blockId,
		visitId,
		agentConfig,
		canInteract,
		isReadOnly,
		initialHasGeneratedResponse,
		onStateChange
	}: Props = $props();

	let messages = $state<LessonAgentChatMessage[]>([]);
	let messageInput = $state('');
	let errorMessage = $state('');
	let isStreaming = $state(false);
	let hasGeneratedResponse = $state(false);
	let isAtBottom = $state(true);
	let userHasScrolled = $state(false);
	let chatContainer: HTMLDivElement | undefined = $state();
	let textarea: HTMLTextAreaElement | undefined = $state();
	let eventSource: EventSource | null = null;
	let lastSyncKey = $state('');
	let autoStartAttemptKey = $state('');

	const syncKey = $derived(`${visitId ?? 'no-visit'}:${blockId}`);
	const initialAssistantMessage = $derived(agentConfig.initialAssistantMessage?.trim() || '');
	const userTurnCount = $derived(messages.filter((message) => message.type === 'USER').length);
	const assistantTurnCount = $derived(
		messages.filter((message) => message.type === 'ASSISTANT').length
	);
	const hasUserResponse = $derived(userTurnCount > 0);
	const inputLocked = $derived(
		agentConfig.interactionMode === 'single_turn' && userTurnCount > 0
	);
	const composerBlockedByAutoStart = $derived(
		agentConfig.autoStartOnEnter &&
			agentConfig.interactionMode !== 'none' &&
			!hasGeneratedResponse
	);
	const canCompose = $derived(
		canInteract &&
			!isReadOnly &&
			agentConfig.interactionMode !== 'none' &&
			!inputLocked &&
			!composerBlockedByAutoStart &&
			!isStreaming
	);

	$effect(() => {
		if (syncKey === lastSyncKey) return;
		lastSyncKey = syncKey;
		stopStream();
		messages = normalizeMessages(initialMessages);
		messageInput = '';
		errorMessage = '';
		hasGeneratedResponse = initialHasGeneratedResponse;
		isAtBottom = true;
		userHasScrolled = false;
		autoStartAttemptKey = '';
		void tick().then(() => scrollToBottom(true));
	});

	$effect(() => {
		onStateChange?.({
			userTurnCount,
			assistantTurnCount,
			hasUserResponse,
			hasGeneratedResponse,
			isStreaming
		});
	});

	$effect(() => {
		const currentAutoStartKey = `${syncKey}:${agentConfig.autoStartOnEnter}`;
		if (
			!agentConfig.autoStartOnEnter ||
			autoStartAttemptKey === currentAutoStartKey ||
			isReadOnly ||
			!canInteract ||
			hasGeneratedResponse ||
			isStreaming
		) {
			return;
		}

		autoStartAttemptKey = currentAutoStartKey;
		void startAssistantStream({ autoStart: true });
	});

	onDestroy(() => {
		stopStream();
	});

	function normalizeMessages(
		source: Array<{ id: string; type: string; content: string }>
	): LessonAgentChatMessage[] {
		return source
			.filter(
				(message): message is { id: string; type: string; content: string } =>
					message.type === 'USER' || message.type === 'ASSISTANT'
			)
			.map((message) => ({
				id: message.id,
				type: message.type as LessonAgentChatMessage['type'],
				content: message.content
			}));
	}

	function stopStream() {
		eventSource?.close();
		eventSource = null;
		isStreaming = false;
	}

	function handleScroll() {
		if (!chatContainer) return;
		const threshold = 120;
		const distanceFromBottom =
			chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
		isAtBottom = distanceFromBottom <= threshold;
		if (!isAtBottom) {
			userHasScrolled = true;
		}
	}

	function scrollToBottom(force = false) {
		if (!chatContainer) return;
		if (force || !userHasScrolled || isAtBottom) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	}

	function queueScroll(force = false) {
		void tick().then(() => scrollToBottom(force));
	}

	function autoResize() {
		if (!textarea) return;
		textarea.style.height = '0';
		textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
	}

	function resetComposer() {
		messageInput = '';
		if (textarea) {
			textarea.style.height = 'auto';
		}
	}

	function ensureInitialAssistantMessage() {
		if (!initialAssistantMessage) return;
		if (
			messages.some(
				(message) =>
					message.type === 'ASSISTANT' && message.content.trim() === initialAssistantMessage
			)
		) {
			return;
		}

		messages = [
			...messages,
			{
				id: crypto.randomUUID(),
				type: 'ASSISTANT',
				content: initialAssistantMessage
			}
		];
	}

	function removeMessageById(messageId: string) {
		messages = messages.filter((message) => message.id !== messageId);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void sendMessage();
		}
	}

	function buildEndpointUrl(options: { autoStart?: boolean; message?: string }): string {
		const url = new URL(
			`/api/lesson/${activityId}/session/${sessionId}/block/${blockId}/agent`,
			window.location.origin
		);
		if (options.autoStart) {
			url.searchParams.set('autoStart', 'true');
		}
		if (options.message) {
			url.searchParams.set('message', options.message);
		}
		return url.toString();
	}

	function startStream(url: string, assistantMessageId: string) {
		stopStream();
		isStreaming = true;
		errorMessage = '';
		userHasScrolled = false;
		isAtBottom = true;

		eventSource = new EventSource(url);
		eventSource.addEventListener('message', (event) => {
			if (event.data === '[DONE]') {
				stopStream();
				void invalidateAll();
				setTimeout(() => textarea?.focus(), 0);
				return;
			}

			let parsedData: { text?: string; error?: string };
			try {
				parsedData = JSON.parse(event.data) as { text?: string; error?: string };
			} catch {
				return;
			}

			if (parsedData.error) {
				errorMessage = parsedData.error;
				stopStream();
				const assistantMessage = messages.find((message) => message.id === assistantMessageId);
				if (assistantMessage && assistantMessage.content.trim().length === 0) {
					removeMessageById(assistantMessageId);
				}
				return;
			}

			if (parsedData.text === undefined) return;
			if (parsedData.text.length > 0) {
				hasGeneratedResponse = true;
			}

			messages = messages.map((message) =>
				message.id === assistantMessageId
					? { ...message, content: message.content + parsedData.text }
					: message
			);
			queueScroll();
		});

		eventSource.addEventListener('error', () => {
			errorMessage = 'Se perdió la conexión con el servidor. Inténtalo de nuevo.';
			stopStream();
			const assistantMessage = messages.find((message) => message.id === assistantMessageId);
			if (assistantMessage && assistantMessage.content.trim().length === 0) {
				removeMessageById(assistantMessageId);
			}
		});
	}

	async function startAssistantStream(options: { autoStart?: boolean; message?: string }) {
		if (isStreaming || isReadOnly || !canInteract) return;

		errorMessage = '';
		if (initialAssistantMessage && messages.length === 0) {
			ensureInitialAssistantMessage();
		}

		const assistantMessageId = crypto.randomUUID();
		messages = [
			...messages,
			{
				id: assistantMessageId,
				type: 'ASSISTANT',
				content: ''
			}
		];
		queueScroll(true);
		startStream(buildEndpointUrl(options), assistantMessageId);
	}

	async function sendMessage() {
		const text = messageInput.trim();
		if (!text || !canCompose) return;

		errorMessage = '';
		if (initialAssistantMessage && messages.length === 0) {
			ensureInitialAssistantMessage();
		}

		messages = [
			...messages,
			{
				id: crypto.randomUUID(),
				type: 'USER',
				content: text
			}
		];
		resetComposer();
		queueScroll(true);
		await startAssistantStream({ message: text });
	}
</script>

<div class="space-y-4">
	{#if errorMessage}
		<div class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
			{errorMessage}
		</div>
	{/if}

	<div
		bind:this={chatContainer}
		class="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/30"
		onscroll={handleScroll}
	>
		{#if messages.length === 0}
			<p class="text-sm text-gray-500 dark:text-gray-400">
				{agentConfig.interactionMode === 'none'
					? 'La respuesta automática aparecerá aquí en cuanto el bloque se inicialice.'
					: agentConfig.autoStartOnEnter
						? 'La IA abrirá este bloque automáticamente en cuanto se prepare el streaming.'
						: 'Todavía no hay mensajes en este bloque.'}
			</p>
		{:else}
			{#each messages as message (message.id)}
				<div
					class="rounded-lg px-4 py-3 {message.type === 'USER'
						? 'ml-10 bg-primary-600 text-white'
						: 'mr-10 bg-white text-gray-900 dark:bg-gray-800 dark:text-white'}"
				>
					<div class="prose max-w-none dark:prose-invert">
						{@html renderMarkdownMath(message.content)}
					</div>
				</div>
			{/each}
		{/if}
	</div>

	{#if agentConfig.interactionMode === 'none'}
		<div class="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:bg-sky-950/20 dark:text-sky-200">
			{isStreaming
				? 'La IA está generando la respuesta de este bloque.'
				: 'Este bloque IA se ejecuta automáticamente al entrar y muestra directamente la respuesta generada.'}
		</div>
	{:else if !isReadOnly && inputLocked}
		<div class="rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800 dark:bg-primary-950/20 dark:text-primary-200">
			Este bloque acepta una única intervención del alumno. Ya puedes continuar cuando revises la respuesta.
		</div>
	{:else if !isReadOnly && composerBlockedByAutoStart}
		<div class="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:bg-sky-950/20 dark:text-sky-200">
			{isStreaming
				? 'La IA está preparando el arranque automático de este bloque.'
				: 'Este bloque abrirá la conversación automáticamente antes de aceptar una respuesta del alumno.'}
		</div>
	{:else if !isReadOnly && agentConfig.autoStartOnEnter && assistantTurnCount > 0 && !hasUserResponse}
		<div class="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:bg-sky-950/20 dark:text-sky-200">
			La conversación se abrió automáticamente al entrar en el bloque. Ya puedes responder.
		</div>
	{/if}

	{#if agentConfig.interactionMode !== 'none' && !isReadOnly}
		<div class="flex gap-3">
			<textarea
				bind:this={textarea}
				class="min-h-24 flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
				bind:value={messageInput}
				placeholder={agentConfig.placeholder || 'Escribe tu respuesta'}
				oninput={autoResize}
				onkeydown={handleKeydown}
				disabled={!canCompose}
			></textarea>
			<button
				class="inline-flex h-fit items-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
				onclick={sendMessage}
				disabled={!canCompose || !messageInput.trim()}
			>
				<SendHorizontal class="h-4 w-4" />
				{agentConfig.submitLabel || 'Enviar'}
			</button>
		</div>
	{/if}
</div>
