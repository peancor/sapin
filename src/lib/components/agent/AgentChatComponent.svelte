<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { marked } from 'marked';
    import type { AgentStreamPart, AgentDisplayMessage, AgentDisplayPart } from '$lib/types/agent';
    import HumanInTheLoopModal from './HumanInTheLoopModal.svelte';
    import UIComponentRenderer from './UIComponentRenderer.svelte';

    interface Props {
        initialMessages?: AgentDisplayMessage[];
        apiEndpoint: string;
        user?: { username?: string; alias?: string };
        onComplete?: () => void;
    }

    let { initialMessages = [], apiEndpoint, user, onComplete }: Props = $props();

    // ─── Estado ───
    let messages = $state<AgentDisplayMessage[]>(initialMessages);
    let messageInput = $state('');
    let isLoading = $state(false);
    let isAtBottom = $state(true);
    let userHasScrolled = $state(false);
    let errorMessage = $state('');

    let chatContainer: HTMLDivElement | undefined = $state();
    let textarea: HTMLTextAreaElement | undefined = $state();
    let eventSource: EventSource | null = null;

    // ─── HITL state ───
    let hitlOpen = $state(false);
    let hitlToolCallId = $state('');
    let hitlToolName = $state('');
    let hitlToolDisplayName = $state('');
    let hitlArgs = $state<Record<string, unknown>>({});
    let hitlRiskLevel = $state<'low' | 'medium' | 'high'>('low');
    let hitlConfirmationMessage = $state('');

    // Base URL for the confirm-tool endpoint (strip trailing /ask)
    const apiBaseForHitl = $derived(apiEndpoint.replace(/\/ask$/, ''));

    // ─── Utilidades ───
    function processContent(content: string): string {
        // Filtrar marcadores internos
        return content
            .replace(/\[\[DONE\]\]/g, '')
            .replace(/\[\[CONTEXTO_RAG\]\][\s\S]*?\[\[FIN_CONTEXTO_RAG\]\]/g, '')
            .trim();
    }

    function renderMarkdown(content: string): string {
        try {
            return marked(processContent(content)) as string;
        } catch {
            return processContent(content);
        }
    }

    function scrollToBottom(force = false) {
        if (!chatContainer) return;
        if (force || isAtBottom) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    function handleScroll() {
        if (!chatContainer) return;
        const threshold = 120;
        const distanceFromBottom =
            chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
        isAtBottom = distanceFromBottom <= threshold;
        if (!isAtBottom) userHasScrolled = true;
    }

    function autoResize() {
        if (!textarea) return;
        textarea.style.height = '0';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    // ─── Envío de mensajes ───
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function sendMessage() {
        const text = messageInput.trim();
        if (!text || isLoading) return;

        errorMessage = '';
        messageInput = '';
        if (textarea) textarea.style.height = 'auto';

        // Añadir mensaje del usuario inmediatamente
        const userMsg: AgentDisplayMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            parts: [{ kind: 'text', content: text }],
            createdAt: new Date()
        };
        messages = [...messages, userMsg];

        // Añadir mensaje del assistant vacío (se irá llenando)
        const assistantMsg: AgentDisplayMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts: [],
            createdAt: new Date()
        };
        messages = [...messages, assistantMsg];
        const assistantMsgId = assistantMsg.id;

        isLoading = true;
        userHasScrolled = false;
        isAtBottom = true;

        setTimeout(() => scrollToBottom(true), 50);

        // Abrir SSE
        const url = new URL(apiEndpoint, window.location.origin);
        url.searchParams.set('message', text);

        startStream(url.toString(), assistantMsgId);
    }

    // ─── SSE stream (reusable for initial send + HITL resume) ───
    let currentAssistantMsgId = '';

    function startStream(url: string, assistantMsgId?: string) {
        // Use the stored assistantMsgId on resume if not provided
        const targetMsgId = assistantMsgId ?? currentAssistantMsgId;
        currentAssistantMsgId = targetMsgId;

        // Acumulador de texto actual del assistant
        let currentTextPartIndex = -1;

        eventSource?.close();
        eventSource = new EventSource(url);

        eventSource.addEventListener('message', (event) => {
            if (event.data === '[DONE]') {
                eventSource?.close();
                eventSource = null;
                isLoading = false;
                return;
            }

            let part: AgentStreamPart;
            try {
                part = JSON.parse(event.data) as AgentStreamPart;
            } catch {
                return;
            }

            // ─── HITL: pause stream when confirmation is required ───
            if ((part as { type: string }).type === 'tool-confirm-required') {
                const p = part as unknown as {
                    type: 'tool-confirm-required';
                    toolCallId: string;
                    toolName: string;
                    toolDisplayName: string;
                    args: Record<string, unknown>;
                    riskLevel: 'low' | 'medium' | 'high';
                    confirmationMessage: string;
                };
                hitlToolCallId = p.toolCallId;
                hitlToolName = p.toolName;
                hitlToolDisplayName = p.toolDisplayName;
                hitlArgs = p.args;
                hitlRiskLevel = p.riskLevel;
                hitlConfirmationMessage = p.confirmationMessage;
                hitlOpen = true;
                // Stream closes on its own after this event; no further SSE events expected
                return;
            }

            // Actualizar el mensaje del assistant según el tipo de parte
            messages = messages.map((msg) => {
                if (msg.id !== targetMsgId) return msg;

                const parts = [...msg.parts];

                switch (part.type) {
                    case 'text-delta': {
                        // Añadir al último text part o crear uno nuevo
                        if (currentTextPartIndex >= 0 && parts[currentTextPartIndex]?.kind === 'text') {
                            const prev = parts[currentTextPartIndex] as { kind: 'text'; content: string };
                            parts[currentTextPartIndex] = { kind: 'text', content: prev.content + part.text };
                        } else {
                            parts.push({ kind: 'text', content: part.text });
                            currentTextPartIndex = parts.length - 1;
                        }
                        break;
                    }

                    case 'tool-call-start': {
                        currentTextPartIndex = -1; // próximo text es nuevo bloque
                        parts.push({
                            kind: 'tool-call',
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            toolDisplayName: part.toolDisplayName,
                            args: part.args,
                            status: 'executing'
                        });
                        break;
                    }

                    case 'tool-call-delta': {
                        const idx = parts.findIndex(
                            (p) => p.kind === 'tool-call' && p.toolCallId === part.toolCallId
                        );
                        if (idx >= 0) {
                            const prev = parts[idx];
                            if (prev.kind === 'tool-call') {
                                parts[idx] = { ...prev, status: 'executing' };
                            }
                        }
                        break;
                    }

                    case 'ui-component': {
                        currentTextPartIndex = -1;
                        parts.push({
                            kind: 'ui-component',
                            instanceId: part.instanceId,
                            componentKey: part.componentKey,
                            props: part.props,
                            interactive: part.interactive
                        });
                        break;
                    }

                    case 'tool-result': {
                        const idx = parts.findIndex(
                            (p) => p.kind === 'tool-call' && p.toolCallId === part.toolCallId
                        );
                        if (idx >= 0) {
                            const prev = parts[idx];
                            if (prev.kind === 'tool-call') {
                                parts[idx] = {
                                    kind: 'tool-call',
                                    toolCallId: prev.toolCallId,
                                    toolName: prev.toolName,
                                    toolDisplayName: prev.toolDisplayName,
                                    args: prev.args,
                                    status: part.status,
                                    result: part.result,
                                    displayResult: part.displayResult,
                                    durationMs: part.durationMs
                                };
                            }
                        }
                        break;
                    }

                    case 'done': {
                        isLoading = false;
                        onComplete?.();
                        break;
                    }

                    case 'error': {
                        errorMessage = part.message;
                        isLoading = false;
                        break;
                    }
                }

                return { ...msg, parts };
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

    // ─── HITL handlers ───
    function handleHitlConfirm(toolCallId: string) {
        hitlOpen = false;
        // Re-open the SSE stream in resume mode to get the agent's follow-up
        const resumeUrl = new URL(apiEndpoint, window.location.origin);
        resumeUrl.searchParams.set('resume', 'true');
        resumeUrl.searchParams.set('toolCallId', toolCallId);
        startStream(resumeUrl.toString());
    }

    function handleHitlReject(toolCallId: string) {
        hitlOpen = false;
        isLoading = false;
        // Update the tool-call part in the current message to show rejected
        messages = messages.map((msg) => {
            if (msg.id !== currentAssistantMsgId) return msg;
            const parts = [...msg.parts];
            const idx = parts.findIndex(
                (p) => p.kind === 'tool-call' && (p as { toolCallId: string }).toolCallId === toolCallId
            );
            if (idx >= 0) {
                const prev = parts[idx];
                if (prev.kind === 'tool-call') {
                    parts[idx] = { ...prev, status: 'rejected' as typeof prev.status, result: { rejected: true } };
                }
            }
            return { ...msg, parts };
        });
    }

    function handleUIComponentRespond(assistantMsgId: string) {
        if (!assistantMsgId || isLoading) return;

        errorMessage = '';
        isLoading = true;
        userHasScrolled = false;
        isAtBottom = true;

        const resumeUrl = new URL(apiEndpoint, window.location.origin);
        resumeUrl.searchParams.set('resume', 'true');
        startStream(resumeUrl.toString(), assistantMsgId);
    }

    // ─── Auto-start: trigger agent greeting when chat is brand new ───
    function sendAutoStart() {
        const assistantMsg: AgentDisplayMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts: [],
            createdAt: new Date()
        };
        messages = [assistantMsg];
        const assistantMsgId = assistantMsg.id;

        isLoading = true;
        userHasScrolled = false;
        isAtBottom = true;

        setTimeout(() => scrollToBottom(true), 50);

        const url = new URL(apiEndpoint, window.location.origin);
        url.searchParams.set('message', `[[Usuario conectado: ${user?.username ?? 'usuario'}]]`);
        startStream(url.toString(), assistantMsgId);
    }

    // ─── Lifecycle ───
    onMount(() => {
        scrollToBottom(true);
        chatContainer?.addEventListener('scroll', handleScroll);

        if (messages.length === 0 && user?.username) {
            sendAutoStart();
        }
    });

    onDestroy(() => {
        eventSource?.close();
        chatContainer?.removeEventListener('scroll', handleScroll);
    });
</script>

<div class="flex h-full flex-col">
    <!-- Mensajes -->
    <div
        bind:this={chatContainer}
        class="flex-1 overflow-y-auto space-y-4 p-4"
    >
        {#if messages.length === 0}
            <div class="flex items-center justify-center h-full text-gray-400 text-sm">
                Escribe un mensaje para comenzar la conversación con el agente.
            </div>
        {/if}

        {#each messages as msg (msg.id)}
            <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
                <div
                    class="max-w-[85%] rounded-2xl px-4 py-3 text-sm
                        {msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-sm'}"
                >
                    {#each msg.parts as part}
                        {#if part.kind === 'text' && part.content}
                            <div
                                class="prose prose-sm max-w-none
                                    {msg.role === 'user' ? 'prose-invert' : 'dark:prose-invert'}"
                            >
                                {@html renderMarkdown(part.content)}
                            </div>

                        {:else if part.kind === 'tool-call'}
                            <!-- Bloque de Tool Call -->
                            <div class="mt-2 rounded-lg border
                                {part.status === 'completed'
                                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                                    : part.status === 'failed'
                                        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                                        : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'}
                                overflow-hidden text-xs">

                                <!-- Header de la herramienta -->
                                <div class="flex items-center gap-2 px-3 py-2 font-medium
                                    {part.status === 'completed'
                                        ? 'text-green-700 dark:text-green-300'
                                        : part.status === 'failed'
                                            ? 'text-red-700 dark:text-red-300'
                                            : 'text-blue-700 dark:text-blue-300'}">
                                    {#if part.status === 'executing'}
                                        <svg class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                        </svg>
                                    {:else if part.status === 'completed'}
                                        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                                        </svg>
                                    {:else if part.status === 'failed'}
                                        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                    {/if}
                                    <span>{part.toolDisplayName}</span>
                                    {#if part.durationMs}
                                        <span class="ml-auto font-normal opacity-60">{part.durationMs}ms</span>
                                    {/if}
                                </div>

                                <!-- Resultado (si hay) -->
                                {#if part.displayResult}
                                    <div class="border-t border-current/10 px-3 py-2 opacity-80">
                                        {part.displayResult}
                                    </div>
                                {/if}
                            </div>

                        {:else if part.kind === 'ui-component'}
                            <UIComponentRenderer
                                instanceId={part.instanceId}
                                componentKey={part.componentKey}
                                props={part.props}
                                interactive={part.interactive}
                                initialUserResponse={part.userResponse}
                                apiBase={apiBaseForHitl}
                                onRespond={() => handleUIComponentRespond(msg.id)}
                            />
                        {/if}
                    {/each}

                    <!-- Loading indicator para el último mensaje del assistant -->
                    {#if msg.role === 'assistant' && isLoading && msg === messages[messages.length - 1] && msg.parts.length === 0}
                        <div class="flex items-center gap-1 py-1">
                            <div class="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 0ms"></div>
                            <div class="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 150ms"></div>
                            <div class="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 300ms"></div>
                        </div>
                    {/if}
                </div>
            </div>
        {/each}
    </div>

    <!-- Error -->
    {#if errorMessage}
        <div class="mx-4 mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300">
            {errorMessage}
        </div>
    {/if}

    <!-- Human-in-the-Loop confirmation modal -->
    <HumanInTheLoopModal
        bind:isOpen={hitlOpen}
        toolCallId={hitlToolCallId}
        toolName={hitlToolName}
        toolDisplayName={hitlToolDisplayName}
        args={hitlArgs}
        riskLevel={hitlRiskLevel}
        confirmationMessage={hitlConfirmationMessage}
        apiBase={apiBaseForHitl}
        onConfirm={handleHitlConfirm}
        onReject={handleHitlReject}
        onError={(msg) => console.error('HITL error:', msg)}
    />

    <!-- Input -->
    <div class="border-t border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-end gap-2">
            <textarea
                bind:this={textarea}
                bind:value={messageInput}
                onkeydown={handleKeydown}
                oninput={autoResize}
                disabled={isLoading}
                placeholder="Escribe un mensaje..."
                rows={1}
                class="flex-1 resize-none rounded-xl border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800
                    px-3 py-2 text-sm text-gray-900 dark:text-gray-100
                    placeholder-gray-400 dark:placeholder-gray-500
                    focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all overflow-hidden"
                style="min-height: 40px; max-height: 120px;"
            ></textarea>

            <button
                onclick={sendMessage}
                disabled={isLoading || !messageInput.trim()}
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl
                    bg-blue-600 text-white hover:bg-blue-700
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-colors"
                aria-label="Enviar mensaje"
            >
                {#if isLoading}
                    <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                {:else}
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                {/if}
            </button>
        </div>

        <p class="mt-1 text-center text-xs text-gray-400">
            Enter para enviar · Shift+Enter para nueva línea
        </p>
    </div>
</div>
