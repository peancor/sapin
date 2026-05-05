<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import 'katex/dist/katex.min.css';
	import type { AgentDisplayMessage, AgentDisplayPart, AgentStreamPart } from '$lib/types/agent';
	import { renderMarkdownMath } from '$lib/utils';
	import HumanInTheLoopModal from '$lib/components/agent/HumanInTheLoopModal.svelte';
	import ImmersiveToolOverlay from '$lib/components/agent/ImmersiveToolOverlay.svelte';
	import UIComponentRenderer from '$lib/components/agent/UIComponentRenderer.svelte';

	interface Props {
		initialMessages?: AgentDisplayMessage[];
		apiEndpoint: string;
		autoStartEnabled?: boolean;
		showComposer?: boolean;
		composerDisabled?: boolean;
		composerPlaceholder?: string;
		onComplete?: () => void;
		onLoadingChange?: (isLoading: boolean) => void;
	}

	type UIComponentDisplayPart = Extract<AgentDisplayPart, { kind: 'ui-component' }>;
	type ActiveImmersiveUI = UIComponentDisplayPart & { assistantMessageId: string };

	let {
		initialMessages = [],
		apiEndpoint,
		autoStartEnabled = true,
		showComposer = true,
		composerDisabled = false,
		composerPlaceholder = 'Escribe tu respuesta',
		onComplete,
		onLoadingChange
	}: Props = $props();

	let messages = $state<AgentDisplayMessage[]>([]);
	let messageInput = $state('');
	let isLoading = $state(false);
	let errorMessage = $state('');
	let chatContainer: HTMLDivElement | undefined = $state();
	let textarea: HTMLTextAreaElement | undefined = $state();
	let eventSource: EventSource | null = null;
	let currentAssistantMsgId = '';
	let uiResponseOverrides = $state<Record<string, Record<string, unknown>>>({});
	let activeImmersiveUI = $state<ActiveImmersiveUI | null>(null);
	let immersiveCanCloseSafely = $state(true);
	let immersiveClosePrompt = $state(
		'Si sales ahora se perdera el progreso no enviado. ¿Quieres cerrar?'
	);

	let hitlOpen = $state(false);
	let hitlToolCallId = $state('');
	let hitlToolName = $state('');
	let hitlToolDisplayName = $state('');
	let hitlArgs = $state<Record<string, unknown>>({});
	let hitlRiskLevel = $state<'low' | 'medium' | 'high'>('low');
	let hitlConfirmationMessage = $state('');
	let lastReportedLoadingState: boolean | null = null;

	const apiBase = $derived(apiEndpoint.replace(/\/ask$/, ''));

	function renderMarkdown(content: string): string {
		try {
			return renderMarkdownMath(content, { stripAgentMarkers: true });
		} catch {
			return content.trim();
		}
	}

	function scrollToBottom(force = false) {
		if (!chatContainer) return;
		if (force) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
			return;
		}

		const threshold = 120;
		const distanceFromBottom =
			chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
		if (distanceFromBottom <= threshold) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	}

	function autoResize() {
		if (!textarea) return;
		textarea.style.height = '0';
		textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
	}

	function getEffectiveUserResponse(
		part: UIComponentDisplayPart
	): Record<string, unknown> | undefined {
		return uiResponseOverrides[part.instanceId] ?? part.userResponse;
	}

	function openImmersiveUI(part: UIComponentDisplayPart, assistantMessageId: string) {
		activeImmersiveUI = { ...part, assistantMessageId };
		immersiveCanCloseSafely = true;
		immersiveClosePrompt = 'Si sales ahora se perdera el progreso no enviado. ¿Quieres cerrar?';
	}

	function closeImmersiveUI() {
		activeImmersiveUI = null;
		immersiveCanCloseSafely = true;
	}

	function handleImmersiveStateChange(state: { canCloseSafely: boolean; closePrompt?: string }) {
		immersiveCanCloseSafely = state.canCloseSafely;
		immersiveClosePrompt =
			state.closePrompt ?? 'Si sales ahora se perdera el progreso no enviado. ¿Quieres cerrar?';
	}

	function handleUIResponsePersisted(instanceId: string, payload: Record<string, unknown>) {
		uiResponseOverrides = {
			...uiResponseOverrides,
			[instanceId]: payload
		};
	}

	function startUserMessage(text: string) {
		if (!text || isLoading) return;

		errorMessage = '';
		messageInput = '';
		if (textarea) textarea.style.height = 'auto';

		const userMessage: AgentDisplayMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			parts: [{ kind: 'text', content: text }],
			createdAt: new Date()
		};
		const assistantMessage: AgentDisplayMessage = {
			id: crypto.randomUUID(),
			role: 'assistant',
			parts: [],
			createdAt: new Date()
		};

		messages = [...messages, userMessage, assistantMessage];
		currentAssistantMsgId = assistantMessage.id;
		isLoading = true;
		scrollToBottom(true);

		const url = new URL(apiEndpoint, window.location.origin);
		url.searchParams.set('message', text);
		startStream(url.toString(), assistantMessage.id);
	}

	function sendMessage() {
		const text = messageInput.trim();
		if (!text || composerDisabled) return;
		startUserMessage(text);
	}

	function sendAutoStart() {
		if (!autoStartEnabled || isLoading || messages.length > 0) return;

		const assistantMessage: AgentDisplayMessage = {
			id: crypto.randomUUID(),
			role: 'assistant',
			parts: [],
			createdAt: new Date()
		};
		messages = [assistantMessage];
		currentAssistantMsgId = assistantMessage.id;
		isLoading = true;
		scrollToBottom(true);

		const url = new URL(apiEndpoint, window.location.origin);
		url.searchParams.set('autoStart', 'true');
		startStream(url.toString(), assistantMessage.id);
	}

	function startStream(url: string, assistantMessageId?: string) {
		const targetAssistantMsgId = assistantMessageId ?? currentAssistantMsgId;
		currentAssistantMsgId = targetAssistantMsgId;
		let currentTextPartIndex = -1;

		eventSource?.close();
		eventSource = new EventSource(url);

		eventSource.addEventListener('message', (event) => {
			if (event.data === '[DONE]') {
				eventSource?.close();
				eventSource = null;
				isLoading = false;
				onComplete?.();
				return;
			}

			let part: AgentStreamPart;
			try {
				part = JSON.parse(event.data) as AgentStreamPart;
			} catch {
				return;
			}

			if (part.type === 'tool-confirm-required') {
				hitlToolCallId = part.toolCallId;
				hitlToolName = part.toolName;
				hitlToolDisplayName = part.toolDisplayName;
				hitlArgs = part.args;
				hitlRiskLevel = part.riskLevel;
				hitlConfirmationMessage = part.confirmationMessage;
				hitlOpen = true;
				return;
			}

			messages = messages.map((message) => {
				if (message.id !== targetAssistantMsgId) return message;

				const parts = [...message.parts];

				switch (part.type) {
					case 'text-delta':
						if (currentTextPartIndex >= 0 && parts[currentTextPartIndex]?.kind === 'text') {
							const previous = parts[currentTextPartIndex] as { kind: 'text'; content: string };
							parts[currentTextPartIndex] = {
								kind: 'text',
								content: previous.content + part.text
							};
						} else {
							parts.push({ kind: 'text', content: part.text });
							currentTextPartIndex = parts.length - 1;
						}
						break;
					case 'tool-call-start':
						currentTextPartIndex = -1;
						parts.push({
							kind: 'tool-call',
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							toolDisplayName: part.toolDisplayName,
							args: part.args,
							status: 'executing'
						});
						break;
					case 'tool-call-delta': {
						const index = parts.findIndex(
							(candidate) =>
								candidate.kind === 'tool-call' && candidate.toolCallId === part.toolCallId
						);
						if (index >= 0) {
							const previous = parts[index];
							if (previous.kind === 'tool-call') {
								parts[index] = { ...previous, status: 'executing' };
							}
						}
						break;
					}
					case 'tool-result': {
						const index = parts.findIndex(
							(candidate) =>
								candidate.kind === 'tool-call' && candidate.toolCallId === part.toolCallId
						);
						if (index >= 0) {
							const previous = parts[index];
							if (previous.kind === 'tool-call') {
								parts[index] = {
									...previous,
									status: part.status,
									result: part.result,
									displayResult: part.displayResult,
									durationMs: part.durationMs
								};
							}
						}
						break;
					}
					case 'ui-component':
						currentTextPartIndex = -1;
						parts.push({
							kind: 'ui-component',
							instanceId: part.instanceId,
							componentKey: part.componentKey,
							props: part.props,
							interactive: part.interactive
						});
						break;
					case 'done':
						isLoading = false;
						break;
					case 'error':
						errorMessage = part.message;
						isLoading = false;
						break;
				}

				return { ...message, parts };
			});

			scrollToBottom();
		});

		eventSource.addEventListener('error', () => {
			eventSource?.close();
			eventSource = null;
			isLoading = false;
			errorMessage = 'Se perdió la conexión con el servidor. Inténtalo de nuevo.';
		});
	}

	function handleHitlConfirm(toolCallId: string) {
		hitlOpen = false;
		const resumeUrl = new URL(apiEndpoint, window.location.origin);
		resumeUrl.searchParams.set('resume', 'true');
		resumeUrl.searchParams.set('toolCallId', toolCallId);
		startStream(resumeUrl.toString());
	}

	function handleHitlReject(toolCallId: string) {
		hitlOpen = false;
		isLoading = false;
		messages = messages.map((message) => {
			if (message.id !== currentAssistantMsgId) return message;

			return {
				...message,
				parts: message.parts.map((part) =>
					part.kind === 'tool-call' && part.toolCallId === toolCallId
						? { ...part, status: 'rejected', result: { rejected: true } }
						: part
				)
			};
		});
	}

	function handleUIComponentRespond(assistantMessageId: string) {
		if (!assistantMessageId || isLoading) return;
		errorMessage = '';
		isLoading = true;

		const resumeUrl = new URL(apiEndpoint, window.location.origin);
		resumeUrl.searchParams.set('resume', 'true');
		startStream(resumeUrl.toString(), assistantMessageId);
	}

	$effect(() => {
		const nextLoadingState = isLoading;
		if (lastReportedLoadingState === nextLoadingState) return;
		lastReportedLoadingState = nextLoadingState;
		untrack(() => {
			onLoadingChange?.(nextLoadingState);
		});
	});

	onMount(() => {
		if (initialMessages.length > 0) {
			messages = structuredClone(initialMessages);
		}
		scrollToBottom(true);
		sendAutoStart();
	});

	onDestroy(() => {
		eventSource?.close();
	});
</script>

<div class="flex h-full flex-col">
	<div bind:this={chatContainer} class="flex-1 space-y-4 overflow-y-auto p-4">
		{#if messages.length === 0}
			<div class="flex h-full items-center justify-center text-sm text-gray-400">
				Escribe un mensaje para comenzar la conversación con el agente.
			</div>
		{/if}

		{#each messages as message (message.id)}
			<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
				<div
					class="max-w-[85%] rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 {message.role ===
					'user'
						? 'border-blue-600 bg-blue-600 text-white'
						: ''}"
				>
					{#each message.parts as part, index (`${message.id}-${index}`)}
						{#if part.kind === 'text' && part.content}
							<div
								class="prose prose-sm max-w-none {message.role === 'user'
									? 'prose-invert'
									: 'dark:prose-invert'}"
							>
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html renderMarkdown(part.content)}
							</div>
						{:else if part.kind === 'tool-call'}
							<div
								class="mt-2 overflow-hidden rounded-lg border border-blue-200 bg-blue-50 text-xs dark:border-blue-800 dark:bg-blue-950"
							>
								<div
									class="flex items-center gap-2 px-3 py-2 font-medium text-blue-700 dark:text-blue-300"
								>
									<span>{part.toolDisplayName}</span>
									{#if part.durationMs}
										<span class="ml-auto font-normal opacity-60">{part.durationMs}ms</span>
									{/if}
								</div>
								{#if part.displayResult}
									<div class="border-t border-current/10 px-3 py-2 opacity-80">
										{part.displayResult}
									</div>
								{/if}
							</div>
						{:else if part.kind === 'ui-component'}
							{@const effectiveUserResponse = getEffectiveUserResponse(part)}
							<UIComponentRenderer
								instanceId={part.instanceId}
								componentKey={part.componentKey}
								props={part.props}
								interactive={!effectiveUserResponse && part.interactive}
								initialUserResponse={effectiveUserResponse}
								{apiBase}
								onRespond={() => handleUIComponentRespond(message.id)}
								onResponsePersisted={(payload) =>
									handleUIResponsePersisted(part.instanceId, payload)}
								onOpenImmersive={() => openImmersiveUI(part, message.id)}
							/>
						{/if}
					{/each}

					{#if message.role === 'assistant' && isLoading && message === messages[messages.length - 1] && message.parts.length === 0}
						<div class="flex items-center gap-1 py-1">
							<div
								class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
								style="animation-delay: 0ms"
							></div>
							<div
								class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
								style="animation-delay: 150ms"
							></div>
							<div
								class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
								style="animation-delay: 300ms"
							></div>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	{#if errorMessage}
		<div
			class="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
		>
			{errorMessage}
		</div>
	{/if}

	<HumanInTheLoopModal
		bind:isOpen={hitlOpen}
		toolCallId={hitlToolCallId}
		toolName={hitlToolName}
		toolDisplayName={hitlToolDisplayName}
		args={hitlArgs}
		riskLevel={hitlRiskLevel}
		confirmationMessage={hitlConfirmationMessage}
		{apiBase}
		onConfirm={handleHitlConfirm}
		onReject={handleHitlReject}
		onError={(message) => {
			errorMessage = message;
		}}
	/>

	{#if activeImmersiveUI}
		<ImmersiveToolOverlay
			open={true}
			title={typeof activeImmersiveUI.props.title === 'string'
				? activeImmersiveUI.props.title
				: activeImmersiveUI.componentKey}
			subtitle="La actividad se ejecuta en una vista inmersiva. El chat queda intacto debajo."
			canCloseSafely={immersiveCanCloseSafely}
			closePrompt={immersiveClosePrompt}
			onclose={closeImmersiveUI}
		>
			<UIComponentRenderer
				instanceId={activeImmersiveUI.instanceId}
				componentKey={activeImmersiveUI.componentKey}
				props={activeImmersiveUI.props}
				interactive={!getEffectiveUserResponse(activeImmersiveUI) && activeImmersiveUI.interactive}
				initialUserResponse={getEffectiveUserResponse(activeImmersiveUI)}
				{apiBase}
				renderMode="immersive"
				onRespond={() => handleUIComponentRespond(activeImmersiveUI!.assistantMessageId)}
				onResponsePersisted={(payload) =>
					handleUIResponsePersisted(activeImmersiveUI!.instanceId, payload)}
				onImmersiveStateChange={handleImmersiveStateChange}
			/>
		</ImmersiveToolOverlay>
	{/if}

	{#if showComposer}
		<div class="border-t border-gray-200 p-4 dark:border-gray-700">
			<div class="flex items-end gap-2">
				<textarea
					bind:this={textarea}
					bind:value={messageInput}
					oninput={autoResize}
					onkeydown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault();
							sendMessage();
						}
					}}
					disabled={isLoading || composerDisabled}
					placeholder={composerPlaceholder}
					rows={1}
					class="flex-1 resize-none overflow-hidden rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
					style="min-height: 40px; max-height: 120px;"
				></textarea>

				<button
					onclick={sendMessage}
					disabled={isLoading || composerDisabled || !messageInput.trim()}
					class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
					aria-label="Enviar mensaje"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
						/>
					</svg>
				</button>
			</div>

			<p class="mt-1 text-center text-xs text-gray-400">
				Enter para enviar · Shift+Enter para nueva línea
			</p>
		</div>
	{/if}
</div>
