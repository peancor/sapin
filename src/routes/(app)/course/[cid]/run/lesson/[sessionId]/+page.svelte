<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import LessonAgentChat from '$lib/components/lesson/LessonAgentChat.svelte';
	import { renderMarkdownMath } from '$lib/utils';
	import { ArrowLeft, RotateCcw } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	interface AgentRuntimeState {
		userTurnCount: number;
		assistantTurnCount: number;
		hasUserResponse: boolean;
		hasGeneratedResponse: boolean;
		isStreaming: boolean;
	}

	let pending = $state(false);
	let errorMessage = $state('');
	let checkOptionIds = $state<string[]>([]);
	let checkNumericValue = $state('');
	let checkTextValue = $state('');
	let agentRuntimeState = $state<AgentRuntimeState>({
		userTurnCount: 0,
		assistantTurnCount: 0,
		hasUserResponse: false,
		hasGeneratedResponse: false,
		isStreaming: false
	});

	const resolvedChoiceBlock = $derived(
		data.resolvedCurrentBlock.kind === 'choice' ? data.resolvedCurrentBlock : null
	);
	const resolvedContentBlock = $derived(
		data.resolvedCurrentBlock.kind === 'content' ? data.resolvedCurrentBlock : null
	);
	const resolvedEndBlock = $derived(
		data.resolvedCurrentBlock.kind === 'end' ? data.resolvedCurrentBlock : null
	);
	const resolvedCheckBlock = $derived(
		data.resolvedCurrentBlock.kind === 'check' ? data.resolvedCurrentBlock : null
	);
	const bodyHtml = $derived(
		renderMarkdownMath((data.resolvedCurrentBlock as { body?: string }).body ?? '')
	);
	const currentOutputs = $derived.by(() => {
		const raw =
			data.currentVisit?.outputsJson ?? data.currentBlockState?.outputsJson ?? null;
		if (!raw) return {};
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return {};
		}
	});
	const checkSubmitted = $derived(currentOutputs.submitted === true);
	const checkPassed = $derived(currentOutputs.passed === true);
	const checkScore = $derived(
		typeof currentOutputs.score === 'number' ? currentOutputs.score : Number(currentOutputs.score ?? 0)
	);
	const checkAttemptCount = $derived(
		typeof currentOutputs.attemptCount === 'number'
			? currentOutputs.attemptCount
			: Number(currentOutputs.attemptCount ?? 0)
	);
	const checkAttemptsRemaining = $derived(
		typeof currentOutputs.attemptsRemaining === 'number' ? currentOutputs.attemptsRemaining : null
	);
	const checkFeedback = $derived(
		typeof currentOutputs.feedback === 'string' ? currentOutputs.feedback : ''
	);
	const agentConfig = $derived(
		data.resolvedCurrentBlock.kind === 'agent' ? data.resolvedCurrentBlock.agentConfig : null
	);
	const agentUserTurnCount = $derived(agentRuntimeState.userTurnCount);
	const agentHasGeneratedResponse = $derived(agentRuntimeState.hasGeneratedResponse);
	const agentHasUserResponse = $derived(agentRuntimeState.hasUserResponse);
	const agentAllowsInput = $derived(
		agentConfig !== null &&
			agentConfig.interactionMode !== 'none' &&
			agentConfig.executionTrigger === 'on_user_submit'
	);
	const agentCanContinue = $derived(
		data.currentBlock.kind === 'agent'
			? (data.currentBlock.requiresResponse ?? true)
				? agentHasUserResponse
				: (!agentConfig?.autoStartOnEnter || agentHasGeneratedResponse)
			: true
	);
	const checkCanRetry = $derived.by(() => {
		if (data.currentBlock.kind !== 'check') return false;
		const attemptsRemaining = currentOutputs.attemptsRemaining;
		const visitCompleted =
			data.currentVisit?.status === 'completed' || data.currentBlockState?.status === 'completed';
		return !visitCompleted && typeof attemptsRemaining === 'number' && attemptsRemaining > 0;
	});
	const checkCanContinue = $derived.by(() => {
		if (data.currentBlock.kind !== 'check') return true;
		return (
			data.currentVisit?.status === 'completed' || data.currentBlockState?.status === 'completed'
		);
	});

	$effect(() => {
		if (data.currentBlock.kind !== 'check') return;
		const outputs = currentOutputs;
		checkOptionIds = Array.isArray(outputs.selectedOptionIds)
			? outputs.selectedOptionIds.filter((value): value is string => typeof value === 'string')
			: [];
		checkNumericValue =
			typeof outputs.answerNumber === 'number' ? String(outputs.answerNumber) : '';
		checkTextValue = typeof outputs.answerText === 'string' ? outputs.answerText : '';
	});

	$effect(() => {
		if (data.currentBlock.kind !== 'agent') {
			agentRuntimeState = {
				userTurnCount: 0,
				assistantTurnCount: 0,
				hasUserResponse: false,
				hasGeneratedResponse: false,
				isStreaming: false
			};
			return;
		}

		const serverUserTurnCount = data.currentChatMessages.filter(
			(message) => message.type === 'USER'
		).length;
		const serverAssistantTurnCount = data.currentChatMessages.filter(
			(message) => message.type === 'ASSISTANT'
		).length;
		const serverHasGeneratedResponse =
			typeof currentOutputs.response === 'string'
				? currentOutputs.response.trim().length > 0
				: data.currentChatMessages.some((message) => message.type === 'ASSISTANT');
		const serverHasUserResponse =
			serverUserTurnCount > 0 ||
			currentOutputs.hasUserResponse === true ||
			(typeof currentOutputs.userTurnCount === 'number' && currentOutputs.userTurnCount > 0);

		agentRuntimeState = {
			userTurnCount: serverUserTurnCount,
			assistantTurnCount: serverAssistantTurnCount,
			hasUserResponse: serverHasUserResponse,
			hasGeneratedResponse: serverHasGeneratedResponse,
			isStreaming: false
		};
	});

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

	async function restart() {
		await handleAction(async () => {
			const result = await postJson(`/api/lesson/${data.activity.id}/session/${data.session.id}/restart`);
			if (result.sessionId) {
				goto(`/course/${data.session.courseId}/run/lesson/${result.sessionId}`);
			}
		});
	}

	function toggleCheckOption(optionId: string, checked: boolean) {
		if (!resolvedCheckBlock) return;
		if (resolvedCheckBlock.checkConfig.mode === 'multiple_choice') {
			checkOptionIds = checked
				? [...checkOptionIds, optionId]
				: checkOptionIds.filter((value) => value !== optionId);
			return;
		}

		checkOptionIds = checked ? [optionId] : [];
	}

	function getCheckPayload() {
		if (!resolvedCheckBlock) return null;
		if (
			resolvedCheckBlock.checkConfig.mode === 'single_choice' ||
			resolvedCheckBlock.checkConfig.mode === 'multiple_choice' ||
			resolvedCheckBlock.checkConfig.mode === 'true_false'
		) {
			return { optionIds: checkOptionIds };
		}
		if (resolvedCheckBlock.checkConfig.mode === 'numeric') {
			return { value: Number(checkNumericValue) };
		}
		return { value: checkTextValue };
	}

	const canSubmitCheck = $derived.by(() => {
		if (!resolvedCheckBlock || data.isReadOnly) return false;
		if (resolvedCheckBlock.checkConfig.mode === 'multiple_choice') {
			return checkOptionIds.length > 0;
		}
		if (
			resolvedCheckBlock.checkConfig.mode === 'single_choice' ||
			resolvedCheckBlock.checkConfig.mode === 'true_false'
		) {
			return checkOptionIds.length === 1;
		}
		if (resolvedCheckBlock.checkConfig.mode === 'numeric') {
			return checkNumericValue.trim() !== '' && Number.isFinite(Number(checkNumericValue));
		}
		return checkTextValue.trim().length > 0;
	});

	async function submitCheck() {
		const payload = getCheckPayload();
		if (!payload) return;
		await handleAction(async () => {
			await postJson(
				`/api/lesson/${data.activity.id}/session/${data.session.id}/block/${data.currentBlock.id}/check`,
				payload
			);
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
				{data.sessionRevisionInfo.isPreview
					? `${data.sessionRevisionInfo.scopeLabel} · intento ${data.session.attemptNumber}`
					: `Lección viva · intento ${data.session.attemptNumber}`}
			</p>
			<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">{data.activity.name}</h1>
			{#if data.activity.description}
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{data.activity.description}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-2">
				{#if data.sessionRevisionInfo.revisionNumber !== null}
					<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
						Revisión #{data.sessionRevisionInfo.revisionNumber}
					</span>
				{/if}
				{#if data.sessionRevisionInfo.isHistoricalApproximation}
					<span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
						Histórico aproximado
					</span>
				{/if}
			</div>
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
		{#if data.sessionRevisionInfo.isPreview}
			<div class="mb-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:bg-sky-950/20 dark:text-sky-200">
				Sesión aislada de preview. No modifica progreso, analítica ni revisión pedagógica del alumnado.
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
		{:else if data.currentBlock.kind === 'check'}
			<div class="mt-6 space-y-4">
				{#if resolvedCheckBlock}
					{#if resolvedCheckBlock.checkConfig.mode === 'single_choice' || resolvedCheckBlock.checkConfig.mode === 'true_false'}
						<div class="grid gap-3">
							{#each resolvedCheckBlock.checkConfig.options as option (option.id)}
								<label class="rounded-xl border border-gray-200 px-4 py-4 transition hover:border-primary-400 hover:bg-primary-50 dark:border-gray-700 dark:hover:bg-primary-900/10">
									<div class="flex items-start gap-3">
										<input
											type="radio"
											name="check-single"
											class="text-primary-600 mt-1 h-4 w-4 border-gray-300"
											checked={checkOptionIds.includes(option.id)}
											onchange={(event) =>
												toggleCheckOption(
													option.id,
													(event.currentTarget as HTMLInputElement).checked
												)}
											disabled={pending || data.isReadOnly}
										/>
										<div>
											<p class="font-medium text-gray-900 dark:text-white">{option.label}</p>
											{#if option.description}
												<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{option.description}</p>
											{/if}
										</div>
									</div>
								</label>
							{/each}
						</div>
					{:else if resolvedCheckBlock.checkConfig.mode === 'multiple_choice'}
						<div class="grid gap-3">
							{#each resolvedCheckBlock.checkConfig.options as option (option.id)}
								<label class="rounded-xl border border-gray-200 px-4 py-4 transition hover:border-primary-400 hover:bg-primary-50 dark:border-gray-700 dark:hover:bg-primary-900/10">
									<div class="flex items-start gap-3">
										<input
											type="checkbox"
											class="text-primary-600 mt-1 h-4 w-4 rounded border-gray-300"
											checked={checkOptionIds.includes(option.id)}
											onchange={(event) =>
												toggleCheckOption(
													option.id,
													(event.currentTarget as HTMLInputElement).checked
												)}
											disabled={pending || data.isReadOnly}
										/>
										<div>
											<p class="font-medium text-gray-900 dark:text-white">{option.label}</p>
											{#if option.description}
												<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{option.description}</p>
											{/if}
										</div>
									</div>
								</label>
							{/each}
						</div>
					{:else if resolvedCheckBlock.checkConfig.mode === 'numeric'}
						<input
							type="number"
							class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
							bind:value={checkNumericValue}
							placeholder="Escribe tu respuesta numérica"
							disabled={pending || data.isReadOnly}
						/>
					{:else}
						<textarea
							class="min-h-28 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
							bind:value={checkTextValue}
							placeholder="Escribe tu respuesta"
							disabled={pending || data.isReadOnly}
						></textarea>
					{/if}

					{#if checkSubmitted}
						<div class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/30">
							<div class="flex flex-wrap items-center gap-2">
								<span class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
									Score: {Number.isFinite(checkScore) ? checkScore.toFixed(2) : '0.00'}
								</span>
								<span class="rounded-full px-2.5 py-1 text-xs font-medium {(checkPassed
									? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
									: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300')}">
									{checkPassed ? 'Superado' : 'Pendiente'}
								</span>
								<span class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
									Intentos: {Number.isFinite(checkAttemptCount) ? checkAttemptCount : 0}
								</span>
								{#if checkAttemptsRemaining !== null}
									<span class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
										Restantes: {checkAttemptsRemaining}
									</span>
								{/if}
							</div>

							{#if checkFeedback}
								<p class="mt-3 text-sm text-gray-700 dark:text-gray-300">{checkFeedback}</p>
							{/if}

							{#if resolvedCheckBlock.checkConfig.revealCorrectAnswer}
								<div class="mt-3 text-sm text-gray-600 dark:text-gray-300">
									<p class="font-medium text-gray-900 dark:text-white">Respuesta correcta</p>
									{#if resolvedCheckBlock.checkConfig.mode === 'numeric'}
										<p class="mt-1">
											{resolvedCheckBlock.checkConfig.acceptedExact ?? 'Rango configurado'}
										</p>
									{:else if resolvedCheckBlock.checkConfig.mode === 'short_text'}
										<p class="mt-1">{resolvedCheckBlock.checkConfig.acceptedAnswers.join(', ')}</p>
									{:else}
										<p class="mt-1">
											{resolvedCheckBlock.checkConfig.options
												.filter((option) =>
													resolvedCheckBlock.checkConfig.correctOptionIds.includes(option.id)
												)
												.map((option) => option.label)
												.join(', ')}
										</p>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<div class="flex flex-wrap justify-end gap-3">
						{#if checkCanRetry}
							<button
								class="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
								onclick={submitCheck}
								disabled={pending || !canSubmitCheck}
							>
								{resolvedCheckBlock.checkConfig.retryLabel || 'Reintentar'}
							</button>
						{:else if !checkCanContinue}
							<button
								class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
								onclick={submitCheck}
								disabled={pending || !canSubmitCheck}
							>
								{resolvedCheckBlock.checkConfig.submitLabel || 'Enviar'}
							</button>
						{/if}

						{#if checkCanContinue}
							<button
								class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
								onclick={advance}
								disabled={pending || data.isReadOnly}
							>
								{resolvedCheckBlock.checkConfig.continueLabel || 'Continuar'}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{:else if data.currentBlock.kind === 'agent'}
			<div class="mt-6 space-y-4">
				{#if agentConfig}
					<LessonAgentChat
						initialMessages={data.currentChatMessages}
						activityId={data.activity.id}
						sessionId={data.session.id}
						blockId={data.currentBlock.id}
						visitId={data.currentVisitId}
						{agentConfig}
						canInteract={agentAllowsInput || agentConfig.interactionMode === 'none'}
						isReadOnly={data.isReadOnly}
						initialHasGeneratedResponse={agentHasGeneratedResponse}
						onStateChange={(state) => {
							agentRuntimeState = state;
						}}
					/>
				{/if}

				<div class="flex justify-end">
					<button
						class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
						onclick={advance}
						disabled={pending || data.isReadOnly || agentRuntimeState.isStreaming || !agentCanContinue}
					>
						{agentConfig?.continueLabel || 'Continuar'}
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
