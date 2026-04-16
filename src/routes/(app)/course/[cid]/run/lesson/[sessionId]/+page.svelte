<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { renderMarkdownMath } from '$lib/utils';
	import { ArrowLeft, RotateCcw, SendHorizontal } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let pending = $state(false);
	let errorMessage = $state('');
	let agentInput = $state('');

	const resolvedChoiceBlock = $derived(
		data.resolvedCurrentBlock.kind === 'choice' ? data.resolvedCurrentBlock : null
	);
	const resolvedAgentBlock = $derived(
		data.resolvedCurrentBlock.kind === 'agent' ? data.resolvedCurrentBlock : null
	);
	const resolvedContentBlock = $derived(
		data.resolvedCurrentBlock.kind === 'content' ? data.resolvedCurrentBlock : null
	);
	const resolvedEndBlock = $derived(
		data.resolvedCurrentBlock.kind === 'end' ? data.resolvedCurrentBlock : null
	);
	const bodyHtml = $derived(
		renderMarkdownMath((data.resolvedCurrentBlock as { body?: string }).body ?? '')
	);
	const hasAgentResponse = $derived(
		data.currentChatMessages.some((message) => message.type === 'ASSISTANT')
	);

	async function handleAction(callback: () => Promise<void>) {
		pending = true;
		errorMessage = '';
		try {
			await callback();
			await invalidateAll();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'No se pudo completar la acción';
		} finally {
			pending = false;
		}
	}

	async function postJson(url: string, payload?: unknown) {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: payload ? JSON.stringify(payload) : undefined
		});
		const result = (await response.json().catch(() => ({}))) as { error?: string; sessionId?: string };
		if (!response.ok) {
			throw new Error(result.error || 'La operación ha fallado');
		}
		return result;
	}

	function goBack() {
		goto(`/course/${data.session.courseId}/run`);
	}

	async function advance() {
		await handleAction(async () => {
			await postJson(
				`/api/lesson/${data.activity.id}/session/${data.session.id}/block/${data.currentBlock.id}/advance`
			);
		});
	}

	async function choose(optionId: string) {
		await handleAction(async () => {
			await postJson(
				`/api/lesson/${data.activity.id}/session/${data.session.id}/block/${data.currentBlock.id}/choice`,
				{ optionId }
			);
		});
	}

	async function sendAgentMessage() {
		if (!agentInput.trim()) return;
		const message = agentInput;
		agentInput = '';
		await handleAction(async () => {
			await postJson(
				`/api/lesson/${data.activity.id}/session/${data.session.id}/block/${data.currentBlock.id}/agent`,
				{ message }
			);
		});
	}

	async function restart() {
		await handleAction(async () => {
			const result = await postJson(`/api/lesson/${data.activity.id}/session/${data.session.id}/restart`);
			if (result.sessionId) {
				goto(`/course/${data.session.courseId}/run/lesson/${result.sessionId}`);
			}
		});
	}
</script>

<div class="space-y-6">
	<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-900/40">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<button class="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm" onclick={goBack}>
				<ArrowLeft class="h-4 w-4" />
				Volver al curso
			</button>
			{#if data.canRestart}
				<button class="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm" onclick={restart} disabled={pending}>
					<RotateCcw class="h-4 w-4" />
					Reiniciar intento
				</button>
			{/if}
		</div>

		<div class="mt-4">
			<p class="text-sm uppercase tracking-wide text-amber-600 dark:text-amber-400">
				Lección viva · intento {data.session.attemptNumber}
			</p>
			<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">{data.activity.name}</h1>
			{#if data.activity.description}
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{data.activity.description}</p>
			{/if}
		</div>

		<div class="mt-4 flex flex-wrap gap-2">
			{#each data.definition.blocks as block (block.id)}
				{@const state = data.blockStates.find((item) => item.blockId === block.id)}
				<span
					class="rounded-full px-3 py-1 text-xs font-medium {data.currentBlock.id === block.id
						? 'bg-primary-600 text-white'
						: state?.status === 'completed'
							? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300'
							: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}"
				>
					{block.title}
				</span>
			{/each}
		</div>
	</div>

	<div class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900/40">
		<div class="mb-4">
			<p class="text-sm uppercase tracking-wide text-gray-500">{data.currentBlock.kind}</p>
			<h2 class="text-xl font-semibold text-gray-900 dark:text-white">{data.resolvedCurrentBlock.title}</h2>
		</div>

		{#if data.isReadOnly}
			<div class="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
				Esta lesson está en modo solo lectura. Puedes revisar el contenido, pero no avanzar ni crear nuevas respuestas.
			</div>
		{/if}

		{#if errorMessage}
			<div class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
				{errorMessage}
			</div>
		{/if}

		<div class="prose max-w-none dark:prose-invert">
			{@html bodyHtml}
		</div>

		{#if data.currentAssets.length > 0}
			<div class="mt-6 grid gap-4 md:grid-cols-2">
				{#each data.currentAssets as asset (asset.fileId)}
					<div class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
						{#if asset.kind === 'image'}
							<img src={asset.url} alt={asset.name} class="max-h-80 w-full rounded-lg object-cover" />
						{:else if asset.kind === 'video'}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video src={asset.url} controls class="w-full rounded-lg"></video>
						{:else if asset.kind === 'audio'}
							<audio src={asset.url} controls class="w-full"></audio>
						{:else}
							<a href={asset.url} target="_blank" class="text-primary-600 hover:underline">
								{asset.name}
							</a>
						{/if}
						{#if asset.caption}
							<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{asset.caption}</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if data.currentBlock.kind === 'content'}
			<div class="mt-6 flex justify-end">
				<button
					class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
					onclick={advance}
					disabled={pending || data.isReadOnly}
				>
					{resolvedContentBlock?.continueLabel || 'Siguiente'}
				</button>
			</div>
		{:else if data.currentBlock.kind === 'choice'}
			<div class="mt-6 grid gap-3">
				{#each resolvedChoiceBlock?.options ?? [] as option (option.id)}
					<button
						class="rounded-xl border border-gray-200 px-4 py-4 text-left transition hover:border-primary-400 hover:bg-primary-50 dark:border-gray-700 dark:hover:bg-primary-900/10"
						onclick={() => choose(option.id)}
						disabled={pending || data.isReadOnly}
					>
						<p class="font-medium text-gray-900 dark:text-white">{option.label}</p>
						{#if option.description}
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{option.description}</p>
						{/if}
					</button>
				{/each}
			</div>
		{:else if data.currentBlock.kind === 'agent'}
			<div class="mt-6 space-y-4">
				<div class="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/30">
					{#if data.currentChatMessages.length === 0}
						<p class="text-sm text-gray-500 dark:text-gray-400">Todavía no hay mensajes en este bloque.</p>
					{:else}
						{#each data.currentChatMessages as message (message.id)}
							<div class="rounded-lg px-4 py-3 {message.type === 'USER'
								? 'ml-10 bg-primary-600 text-white'
								: message.type === 'ASSISTANT'
									? 'mr-10 bg-white text-gray-900 dark:bg-gray-800 dark:text-white'
									: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}">
								<div class="prose max-w-none dark:prose-invert">
									{@html renderMarkdownMath(message.content)}
								</div>
							</div>
						{/each}
					{/if}
				</div>

				{#if !data.isReadOnly}
					<div class="flex gap-3">
						<textarea
							class="min-h-24 flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
							bind:value={agentInput}
							placeholder={resolvedAgentBlock?.agentConfig.placeholder || 'Escribe tu respuesta'}
						></textarea>
						<button
							class="inline-flex h-fit items-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
							onclick={sendAgentMessage}
							disabled={pending || !agentInput.trim()}
						>
							<SendHorizontal class="h-4 w-4" />
							{resolvedAgentBlock?.agentConfig.submitLabel || 'Enviar'}
						</button>
					</div>
				{/if}

				<div class="flex justify-end">
					<button
						class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
						onclick={advance}
						disabled={pending || data.isReadOnly || !hasAgentResponse}
					>
						{resolvedAgentBlock?.agentConfig.continueLabel || 'Continuar'}
					</button>
				</div>
			</div>
		{:else if data.currentBlock.kind === 'end'}
			<div class="mt-6 flex justify-end">
				<button class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700" onclick={goBack}>
					{resolvedEndBlock?.ctaLabel || 'Volver al curso'}
				</button>
			</div>
		{/if}
	</div>
</div>
