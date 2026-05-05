<script lang="ts">
	import { marked } from 'marked';
	import katex from 'katex';
	import markedKatex from 'marked-katex-extension';
	import 'katex/dist/katex.min.css';
	import {
		Paperclip,
		Upload,
		Image,
		AlertTriangle,
		ArrowUp,
		ChevronsUp,
		KeyRound,
		ArrowDown
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { Spinner, TextPlaceholder } from 'flowbite-svelte';
	import { preprocessMathExpressions } from '$lib/utils';

	marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

	interface Message {
		content: string;
		type: 'user' | 'assistant';
	}

	interface ChatUser {
		username?: string;
		alias?: string;
	}

	// Interface para métricas de mensajes
	interface MessageMetrics {
		keystrokeCount: number;
		pasteCount: number;
		charCount: number;
		wordCount: number;
		timeSpentSeconds: number;
		editCount: number;
		deleteCount: number;
		startTimestamp: number;
		deviceInfo: {
			isMobile: boolean;
			userAgent: string;
			screenSize: string;
		};
	}

	let props = $props<{
		initialMessages?: Message[];
		apiEndpoint: string;
		user?: ChatUser;
		onSendMessage?: (message: string) => void;
	}>();

	let messageInput = $state('');
	let messages = $state<Message[]>(props.initialMessages || []);
	let container: HTMLDivElement | null = $state(null);
	let serverSentEvents: EventSource | null = null;
	let retryCount = 0;
	const MAX_RETRIES = 3;

	// Variables para métricas
	let messageMetrics = $state<MessageMetrics>({
		keystrokeCount: 0,
		pasteCount: 0,
		charCount: 0,
		wordCount: 0,
		timeSpentSeconds: 0,
		editCount: 0,
		deleteCount: 0,
		startTimestamp: Date.now(),
		deviceInfo: {
			isMobile: false,
			userAgent: '',
			screenSize: ''
		}
	});
	
	let metricsInterval: number | null = null;

	let responseText = $state('');
	let isLoading = $state(false);

	let userHasScrolled = $state(false);
	let isAtBottom = $state(true);
	let errorMessage = $state('');

	// Add mobile detection
	let isMobileDevice = $state(false);

	function checkIfMobile() {
		return (
			window.innerWidth <= 768 ||
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
		);
	}

	function resetResponseState() {
		responseText = '';
	}

	function checkIfAtBottom() {
		if (!container) return false;
		const threshold = 100;
		return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
	}

	function handleScroll() {
		if (!container) return;
		userHasScrolled = true;
		isAtBottom = checkIfAtBottom();
	}

	function scrollChatToBottom() {
		if (!container) return;
		container.scrollTop = container.scrollHeight;
	}

	function scrollChatToMiddle() {
		if (!container) return;
		const lastMessage = container.querySelector('.chat-container > div > div:last-child');
		if (lastMessage instanceof HTMLElement) {
			const containerHeight = container.clientHeight;
			const messageTop = lastMessage.offsetTop;
			const scrollPosition = messageTop - containerHeight / 2;
			container.scrollTo({
				top: scrollPosition,
				behavior: 'smooth'
			});
		}
	}

	function scrollToNewMessage() {
		if (!container) return;
		const lastMessage = container.querySelector('.chat-container > div > div:last-child');
		if (lastMessage instanceof HTMLElement) {
			const containerHeight = container.clientHeight;
			const lastMessageHeight = lastMessage.offsetHeight;
			const scrollPosition = lastMessage.offsetTop - (containerHeight - lastMessageHeight - 100);
			container.scrollTo({
				top: scrollPosition,
				behavior: 'smooth'
			});
		}
	}

	// Reiniciar métricas después de enviar un mensaje
	function resetMetrics() {
		messageMetrics = {
			keystrokeCount: 0,
			pasteCount: 0,
			charCount: 0,
			wordCount: 0,
			timeSpentSeconds: 0,
			editCount: 0,
			deleteCount: 0,
			startTimestamp: Date.now(),
			deviceInfo: {
				isMobile: isMobileDevice,
				userAgent: navigator.userAgent,
				screenSize: `${window.innerWidth}x${window.innerHeight}`
			}
		};

		// Iniciar contador de tiempo
		if (metricsInterval) {
			clearInterval(metricsInterval);
		}
		metricsInterval = window.setInterval(() => {
			messageMetrics.timeSpentSeconds = Math.floor((Date.now() - messageMetrics.startTimestamp) / 1000);
		}, 1000);
	}

	// Actualizar métricas de palabras y caracteres
	function updateTextMetrics() {
		messageMetrics.charCount = messageInput.length;
		messageMetrics.wordCount = messageInput.trim() ? messageInput.trim().split(/\s+/).length : 0;
	}

	function submitChatMessage() {
		if (messageInput.trim()) {
			// Actualizar conteo final
			updateTextMetrics();
			
			// Detener el contador de tiempo
			if (metricsInterval) {
				clearInterval(metricsInterval);
				metricsInterval = null;
			}

			messages = [...messages, { content: messageInput, type: 'user' }];

			if (props.onSendMessage) {
				props.onSendMessage(messageInput);
			}

			// Primero enviamos el mensaje
			const currentMessage = messageInput;
			const finalMetrics = JSON.stringify(messageMetrics);
			messageInput = '';

			// Reiniciar métricas para el próximo mensaje
			resetMetrics();

			// Esperamos un tick para que se renderice el mensaje del usuario
			setTimeout(() => {
				scrollToNewMessage();
				sendMessage(currentMessage, finalMetrics);
			}, 0);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !isMobileDevice) {
			event.preventDefault();
			submitChatMessage();
		} else {
			// Incrementar contador de pulsaciones
			messageMetrics.keystrokeCount++;
			
			// Contar borrados
			if (event.key === 'Backspace' || event.key === 'Delete') {
				messageMetrics.deleteCount++;
			}
			
			// Actualizar métricas de texto
			updateTextMetrics();
		}
	}

	// Manejar eventos de paste
	function handlePaste() {
		messageMetrics.pasteCount++;
		// Actualizar métricas después de un corto retraso para capturar el texto pegado
		setTimeout(updateTextMetrics, 10);
	}

	// Manejar eventos de edición (cut)
	function handleCut() {
		messageMetrics.editCount++;
		// Actualizar métricas después de un corto retraso
		setTimeout(updateTextMetrics, 10);
	}

	// Manejar eventos de selección (para potenciales cortes/ediciones)
	function handleSelect() {
		// Solo incrementamos cuando hay una selección real
		if (window.getSelection()?.toString().length) {
			messageMetrics.editCount++;
		}
	}

	function autoResize(event: Event) {
		const textarea = event.target as HTMLTextAreaElement;
		textarea.style.height = '0';
		const newHeight = Math.min(textarea.scrollHeight, 120); // Limit height to 120px
		textarea.style.height = newHeight + 'px';
	}

	function adjustLastMessageHeight() {
		if (container && messages.length > 0) {
			const lastMessage = container.querySelector('.chat-container > div > div:last-child');
			if (lastMessage instanceof HTMLElement) {
				// En lugar de establecer una altura mínima fija, usemos una más pequeña
				// para evitar que el contenedor principal crezca demasiado
				lastMessage.style.minHeight = '50px';
			}
		}
	}

	async function sendMessage(message: string, metrics?: string) {
		if (!message.trim()) return;

		isLoading = true;
		resetResponseState();
		retryCount = 0;

		messages = [...messages, { content: '', type: 'assistant' }];

		// Ajustamos la altura y hacemos scroll después de añadir el mensaje del asistente
		setTimeout(() => {
			adjustLastMessageHeight();
			scrollToNewMessage();
		}, 0);

		if (serverSentEvents) {
			serverSentEvents.close();
		}

		function setupEventSource() {
			const searchParams = new URLSearchParams();
			searchParams.append('question', message);
			
			// Añadir métricas como parámetro si están disponibles
			if (metrics) {
				searchParams.append('metadata', metrics);
			}

			serverSentEvents = new EventSource(`${props.apiEndpoint}?${searchParams.toString()}`);

			serverSentEvents.addEventListener('open', () => {
				retryCount = 0;
				responseText = '';
			});

			serverSentEvents.addEventListener('message', (event) => {
				if (event.data === '[DONE]') {
					serverSentEvents?.close();
					isLoading = false;
					scrollToNewMessage();
					return;
				}

				try {
					const parsedData = JSON.parse(event.data);
					if (parsedData.error) {
						console.error('Error del servidor:', parsedData.error);
						isLoading = false;
						serverSentEvents?.close();
						responseText = `Error del servidor ${parsedData.error}`;
						errorMessage = responseText;
						setTimeout(() => (errorMessage = ''), 3000);
						return;
					}
					if (parsedData.text !== undefined) {
						responseText = responseText + parsedData.text;
						messages[messages.length - 1].content = responseText;
						messages = messages;
						// Solo hacemos scroll si no hay interacción del usuario
						if (!userHasScrolled || isAtBottom) {
							scrollToNewMessage();
						}
					}
				} catch (err) {
					console.error('Error parsing response:', err);
				}
			});

			serverSentEvents.addEventListener('error', (event) => {
				console.error('Error en SSE:', event);
				serverSentEvents?.close();

				if (retryCount < MAX_RETRIES) {
					retryCount++;
					console.log(`Reintentando conexión ${retryCount}/${MAX_RETRIES}...`);
					setTimeout(setupEventSource, 1000 * retryCount);
				} else {
					isLoading = false;
					responseText = 'Error: No se pudo establecer la conexión con el servidor.';
					errorMessage = 'Error: No se pudo establecer la conexión con el servidor.';
					setTimeout(() => (errorMessage = ''), 3000);
				}
			});
		}

		setupEventSource();
	}

	function processThinkTags(content: string) {
		return content.replace(/<think>(.*?)<\/think>/gs, '<div class="think-block">$1</div>');
	}

	function processContent(content: string) {
			// Lista de palabras a filtrar
			const wordsToFilter = ['[[DONE]]'];
			
			// Filtrar las palabras no deseadas
			let filteredContent = content;
			for (const word of wordsToFilter) {
				filteredContent = filteredContent.replace(word, '');
			}
		
			// First preprocess math expressions
			const mathProcessed = preprocessMathExpressions(filteredContent);
			// Then process think tags
			return processThinkTags(mathProcessed);
		}

	function getConnectedUserLabel(user?: ChatUser) {
		return user?.alias?.trim() || user?.username?.trim() || 'usuario';
	}

	onMount(() => {
		// Inicializar métricas 
		resetMetrics();
		
		if (messages.length === 0 && props.user) {
			sendMessage(`[[Usuario conectado: ${getConnectedUserLabel(props.user)}]]`);
		}

		container?.addEventListener('scroll', handleScroll);

		// Check mobile on mount
		isMobileDevice = checkIfMobile();

		// Add resize listener to update mobile status
		const handleResize = () => {
			isMobileDevice = checkIfMobile();
		};

		window.addEventListener('resize', handleResize);

		return () => {
			container?.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', handleResize);
			if (serverSentEvents) {
				serverSentEvents.close();
			}
			// Limpiar intervalo de métricas
			if (metricsInterval) {
				clearInterval(metricsInterval);
				metricsInterval = null;
			}
		};
	});
</script>

<div class="flex h-full max-h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
	<div
		class="mb-2 shrink-0 border-l-4 border-orange-400 bg-gradient-to-r from-orange-100 to-yellow-100 p-2 shadow-sm dark:border-orange-600 dark:from-orange-900/30 dark:to-yellow-900/30"
	>
		<div class="flex items-center">
			<AlertTriangle class="text-orange-600 dark:text-orange-400" size={20} />
			<div class="ml-3">
				<p class="text-sm font-medium text-orange-800 dark:text-orange-200">
					¡Atención! Las conversaciones quedarán registradas y serán visibles para los profesores
					del curso.
				</p>
			</div>
		</div>
	</div>
	{#if errorMessage}
		<div
			class="relative mx-4 mb-2 shrink-0 rounded border border-red-400 bg-red-100 px-4 py-2 text-red-700"
			role="alert"
		>
			<span class="block sm:inline">{errorMessage}</span>
		</div>
	{/if}
	<div class="chat-container mb-3 min-h-0 flex-1 overflow-y-auto" bind:this={container}>
		<div class="flex flex-col gap-2 p-2">
			{#each messages as message}
				{#if !(message.content.trim().startsWith('[[') && message.content.trim().endsWith(']]'))}
					<div class="flex {message.type === 'user' ? 'justify-end' : 'justify-start'}">
						<div
							class="markdown max-w-[70%] rounded-2xl px-4 py-2
							{message.type === 'user'
								? 'max-w-[70%] bg-blue-200 text-white dark:bg-blue-700'
								: 'max-w-[96%] bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'}"
						>
							{#if message.type === 'assistant' && message.content === '' && isLoading}
								<div class="flex justify-center p-2">
									{#if isMobileDevice}
										<Spinner color="red" size="6" />
									{:else}
										<TextPlaceholder size="md" class="mt-8" />
									{/if}
								</div>
							{:else}
								<div class="prose max-w-none dark:prose-invert">
									{#if message.type === 'user'}
										{@html marked(processContent(message.content.replace(/\n/g, '<br>')))}
									{:else}
										{@html marked(processContent(message.content))}
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</div>

	<form
		class="mx-2 mb-2 flex shrink-0 flex-col gap-1 rounded-2xl border border-gray-200 bg-white p-3 shadow-md dark:border-gray-700 dark:bg-gray-800 dark:shadow-gray-900/30"
		onsubmit={(e) => {
			e.preventDefault();
			submitChatMessage();
		}}
	>
		<div class="flex w-full items-end">
			<div class="relative w-full">
				<textarea
					bind:value={messageInput}
					placeholder="Escribe un mensaje..."
					rows="1"
					onkeydown={handleKeydown}
					oninput={autoResize}
					onpaste={handlePaste}
					oncut={handleCut}
					onselect={handleSelect}
					class="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent max-h-[120px] min-h-[40px] w-full resize-none overflow-y-auto bg-transparent px-3 py-2 focus:outline-none dark:text-gray-100 dark:placeholder-gray-400"
					style="overflow-y: auto;"
				></textarea>
			</div>

			<div class="ml-2 self-end {messageInput.trim() ? 'visible' : 'invisible'}">
				<button
					type="submit"
					class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 p-2 text-white transition-all duration-200 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-offset-gray-800"
					aria-label="Enviar mensaje"
					disabled={!messageInput.trim()}
				>
					<ChevronsUp size={20} />
				</button>
			</div>
		</div>

		<div
			class="mt-1 flex h-5 items-center gap-1 pl-2 text-xs text-gray-400 dark:text-gray-500 {!messageInput.trim() ||
			isMobileDevice
				? 'opacity-0'
				: 'opacity-100'} transition-opacity duration-200"
		>
			<KeyRound size={12} />
			<span>Shift</span>
			<span>+</span>
			<span>Enter</span>
			<!-- <ArrowDown size={12} class="rotate-180" /> -->
			<span>para nueva línea</span>
		</div>
	</form>
</div>

<style>
	.chat-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 0.5rem;
		padding: 0.5rem;
		overflow-y: auto;
		position: relative;
	}

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
	}

	.markdown :global(pre) {
		overflow-x: auto;
		border-radius: 0.25rem;
		background-color: var(--code-bg);
		padding: 0.75rem;
	}

	.markdown {
		transition: min-height 0.3s ease;
	}

	.markdown :global(.think-block) {
		margin: 0.5rem 0;
		border-radius: 0.5rem;
		border-left: 4px solid var(--accent-color);
		background-color: var(--think-bg);
		padding: 1rem;
		font-style: italic;
		color: var(--text-color);
	}

	:global(.dark) .markdown :global(.think-block) {
		background-color: rgba(91, 33, 182, 0.3);
		color: rgb(243, 244, 246);
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

	/* Add new styles for the enhanced input area */
	textarea {
		transition: all 0.2s ease;
		line-height: 1.5;
		scrollbar-width: thin;
		overflow-y: auto;
		border: none;
	}

	textarea:focus::placeholder {
		opacity: 0.5;
	}

	textarea:focus-visible {
		outline: none;
	}

	form {
		transition: all 0.3s ease;
		background: white;
	}

	form:focus-within {
		/* Completely remove any focus style changes */
		border-color: #e5e7eb; /* Match exactly the default border color */
		box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
		outline: none;
	}

	/* Apply to any potential focusable element within the form */
	form *:focus {
		outline: none !important;
		box-shadow: none !important;
		border-color: transparent !important;
	}

	:global(.dark) form {
		background: var(--gray-800);
	}

	:global(.dark) form:focus-within {
		border-color: #374151; /* Match exactly the default dark border color */
		box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.3);
	}

	/* Custom scrollbar styling for webkit browsers */
	textarea::-webkit-scrollbar {
		width: 6px;
	}

	textarea::-webkit-scrollbar-track {
		background: transparent;
	}

	textarea::-webkit-scrollbar-thumb {
		background-color: #d1d5db;
		border-radius: 3px;
	}

	:global(.dark) textarea::-webkit-scrollbar-thumb {
		background-color: #4b5563;
	}
</style>
