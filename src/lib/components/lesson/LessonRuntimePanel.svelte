<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import LessonAgentChat from '$lib/components/lesson/LessonAgentChat.svelte';
	import LessonAgentRuntimeChat from '$lib/components/lesson/LessonAgentRuntimeChat.svelte';
	import LessonYoutubePlayer from '$lib/components/lesson/LessonYoutubePlayer.svelte';
	import type { AgentDisplayPart } from '$lib/types/agent';
	import type { LessonCheckQuestion } from '$lib/types/lesson';
	import { renderMarkdownMath } from '$lib/utils';
	import { ArrowLeft, RotateCcw } from 'lucide-svelte';

	interface Props {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		data: any;
		backHref: string;
		backLabel?: string;
		showOverview?: boolean;
		onSessionReplaced?: ((sessionId: string) => void | Promise<void>) | undefined;
	}

	let {
		data,
		backHref,
		backLabel = 'Volver',
		showOverview = true,
		onSessionReplaced
	}: Props = $props();

	interface AgentRuntimeState {
		userTurnCount: number;
		assistantTurnCount: number;
		hasUserResponse: boolean;
		hasGeneratedResponse: boolean;
		isStreaming: boolean;
	}

	type RuntimeMessagePart = AgentDisplayPart;

	let pending = $state(false);
	let errorMessage = $state('');
	let checkAnswers = $state<Record<string, { optionIds: string[]; value: string }>>({});
	let checkStepIndex = $state(0);
	let agentRuntimeState = $state<AgentRuntimeState>({
		userTurnCount: 0,
		assistantTurnCount: 0,
		hasUserResponse: false,
		hasGeneratedResponse: false,
		isStreaming: false
	});

	const resolvedChoiceBlock = $derived.by(() =>
		data.resolvedCurrentBlock.kind === 'choice' ? data.resolvedCurrentBlock : null
	);
	const resolvedContentBlock = $derived.by(() =>
		data.resolvedCurrentBlock.kind === 'content' ? data.resolvedCurrentBlock : null
	);
	const resolvedEndBlock = $derived.by(() =>
		data.resolvedCurrentBlock.kind === 'end' ? data.resolvedCurrentBlock : null
	);
	const resolvedCheckBlock = $derived.by(() =>
		data.resolvedCurrentBlock.kind === 'check' ? data.resolvedCurrentBlock : null
	);
	const resolvedYoutubeBlock = $derived.by(() =>
		data.resolvedCurrentBlock.kind === 'youtube' ? data.resolvedCurrentBlock : null
	);
	const bodyHtml = $derived.by(() =>
		renderMarkdownMath((data.resolvedCurrentBlock as { body?: string }).body ?? '')
	);
	const currentOutputs = $derived.by(() => {
		const raw = data.currentVisit?.outputsJson ?? data.currentBlockState?.outputsJson ?? null;
		if (!raw) return {};
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return {};
		}
	});
	const checkSubmitted = $derived.by(() => currentOutputs.submitted === true);
	const checkPassed = $derived.by(() => currentOutputs.passed === true);
	const checkScore = $derived.by(() =>
		typeof currentOutputs.score === 'number'
			? currentOutputs.score
			: Number(currentOutputs.score ?? 0)
	);
	const checkAttemptCount = $derived.by(() =>
		typeof currentOutputs.attemptCount === 'number'
			? currentOutputs.attemptCount
			: Number(currentOutputs.attemptCount ?? 0)
	);
	const checkAttemptsRemaining = $derived.by(() =>
		typeof currentOutputs.attemptsRemaining === 'number' ? currentOutputs.attemptsRemaining : null
	);
	const checkFeedback = $derived.by(() =>
		typeof currentOutputs.feedback === 'string' ? currentOutputs.feedback : ''
	);
	const checkQuestions = $derived.by(
		() => (resolvedCheckBlock?.checkConfig.questions ?? []) as LessonCheckQuestion[]
	);
	const checkQuestionResults = $derived.by(() =>
		Array.isArray(currentOutputs.questionResults)
			? currentOutputs.questionResults.filter(
					(result): result is Record<string, unknown> =>
						!!result && typeof result === 'object' && 'questionId' in result
				)
			: []
	);
	const checkCorrectCount = $derived.by(() =>
		typeof currentOutputs.correctCount === 'number'
			? currentOutputs.correctCount
			: Number(currentOutputs.correctCount ?? 0)
	);
	const checkTotalQuestions = $derived.by(() =>
		typeof currentOutputs.totalQuestions === 'number'
			? currentOutputs.totalQuestions
			: checkQuestions.length
	);
	const checkAnsweredCount = $derived.by(
		() => checkQuestions.filter((question: LessonCheckQuestion) => questionHasAnswer(question)).length
	);
	const agentConfig = $derived.by(() =>
		data.resolvedCurrentBlock.kind === 'agent' ? data.resolvedCurrentBlock.agentConfig : null
	);
	const agentUsesRuntime = $derived.by(() => agentConfig?.runtimeMode === 'agent');
	const agentHasGeneratedResponse = $derived.by(() => agentRuntimeState.hasGeneratedResponse);
	const agentHasUserResponse = $derived.by(() => agentRuntimeState.hasUserResponse);
	const agentApiEndpoint = $derived.by(() =>
		data.currentBlock.kind !== 'agent'
			? ''
			: agentUsesRuntime
				? `/api/lesson/${data.activity.id}/session/${data.session.id}/block/${data.currentBlock.id}/agent-chat/ask`
				: `/api/lesson/${data.activity.id}/session/${data.session.id}/block/${data.currentBlock.id}/agent`
	);
	const agentAllowsInput = $derived.by(
		() =>
			agentConfig !== null &&
			agentConfig.interactionMode !== 'none' &&
			agentConfig.executionTrigger === 'on_user_submit' &&
			(agentConfig.interactionMode !== 'single_turn' || !agentHasUserResponse)
	);
	const agentCanContinue = $derived.by(() =>
		data.currentBlock.kind === 'agent'
			? (data.currentBlock.requiresResponse ?? true)
				? agentHasUserResponse
				: !agentConfig?.autoStartOnEnter || agentHasGeneratedResponse
			: true
	);
	const agentAutoStartStatus = $derived.by(() =>
		typeof currentOutputs.autoStartStatus === 'string' ? currentOutputs.autoStartStatus : ''
	);
	const agentAutoStartError = $derived.by(() =>
		typeof currentOutputs.autoStartError === 'string' ? currentOutputs.autoStartError : ''
	);
	const agentExtractionStatus = $derived.by(() =>
		typeof currentOutputs.extractionStatus === 'string' ? currentOutputs.extractionStatus : ''
	);
	const agentExtractionMessage = $derived.by(() =>
		typeof currentOutputs.extractionMessage === 'string' ? currentOutputs.extractionMessage : ''
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
	const youtubeCanContinue = $derived.by(() => {
		if (data.currentBlock.kind !== 'youtube') return true;
		return (
			currentOutputs.completed === true ||
			data.currentVisit?.status === 'completed' ||
			data.currentBlockState?.status === 'completed'
		);
	});

	$effect(() => {
		if (data.currentBlock.kind !== 'check') return;
		const outputs = currentOutputs;
		const outputAnswers = Array.isArray(outputs.answers) ? outputs.answers : [];
		const nextAnswers: Record<string, { optionIds: string[]; value: string }> = {};
		for (const question of checkQuestions) {
			const existing = outputAnswers.find(
				(answer): answer is Record<string, unknown> =>
					!!answer &&
					typeof answer === 'object' &&
					(answer as Record<string, unknown>).questionId === question.id
			);
			nextAnswers[question.id] = {
				optionIds: Array.isArray(existing?.optionIds)
					? existing.optionIds.filter((value): value is string => typeof value === 'string')
					: [],
				value:
					typeof existing?.value === 'number' || typeof existing?.value === 'string'
						? String(existing.value)
						: ''
			};
		}
		checkAnswers = nextAnswers;
		checkStepIndex = Math.min(checkStepIndex, Math.max(checkQuestions.length - 1, 0));
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

		const serverUserTurnCount = agentUsesRuntime
			? data.currentAgentMessages.filter((message: { role: string }) => message.role === 'user')
					.length
			: data.currentChatMessages.filter((message: { type: string }) => message.type === 'USER')
					.length;
		const serverAssistantTurnCount = agentUsesRuntime
			? data.currentAgentMessages.filter(
					(message: { role: string }) => message.role === 'assistant'
				).length
			: data.currentChatMessages.filter((message: { type: string }) => message.type === 'ASSISTANT')
					.length;
		const serverHasGeneratedResponse = agentUsesRuntime
			? data.currentAgentMessages.some((message: { parts: RuntimeMessagePart[] }) =>
					message.parts.some(
						(part: RuntimeMessagePart) => part.kind === 'text' && part.content.trim().length > 0
					)
				) ||
				(typeof currentOutputs.response === 'string' && currentOutputs.response.trim().length > 0)
			: typeof currentOutputs.response === 'string'
				? currentOutputs.response.trim().length > 0
				: data.currentChatMessages.some(
						(message: { type: string }) => message.type === 'ASSISTANT'
					);
		const serverHasStructuredUiResponse = agentUsesRuntime
			? data.currentAgentMessages.some((message: { parts: RuntimeMessagePart[] }) =>
					message.parts.some(
						(part: RuntimeMessagePart) => part.kind === 'ui-component' && !!part.userResponse
					)
				)
			: false;
		const serverHasUserResponse =
			serverUserTurnCount > 0 ||
			serverHasStructuredUiResponse ||
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

	function resolvePath(path: string): string {
		return (resolve as unknown as (path: string) => string)(path);
	}

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

	function handleAgentRuntimeLoadingChange(isLoading: boolean) {
		agentRuntimeState.isStreaming = isLoading;
	}

	async function handleAgentRuntimeComplete() {
		await invalidateAll();
	}

	async function postJson(url: string, payload?: unknown) {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: payload ? JSON.stringify(payload) : undefined
		});
		const result = (await response.json().catch(() => ({}))) as {
			error?: string;
			sessionId?: string;
		};
		if (!response.ok) {
			throw new Error(result.error || 'La operación ha fallado');
		}
		return result;
	}

	function goBack() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(resolvePath(backHref));
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
			const result = await postJson(
				`/api/lesson/${data.activity.id}/session/${data.session.id}/restart`
			);
			if (result.sessionId) {
				if (onSessionReplaced) {
					onSessionReplaced(result.sessionId);
					return;
				}

				// eslint-disable-next-line svelte/no-navigation-without-resolve
				goto(resolvePath(`/course/${data.session.courseId}/run/lesson/${result.sessionId}`));
			}
		});
	}

	function getCheckAnswer(questionId: string) {
		return checkAnswers[questionId] ?? { optionIds: [], value: '' };
	}

	function toggleCheckOption(question: LessonCheckQuestion, optionId: string, checked: boolean) {
		const current = getCheckAnswer(question.id);
		const optionIds =
			question.mode === 'multiple_choice'
				? checked
					? [...new Set([...current.optionIds, optionId])]
					: current.optionIds.filter((value) => value !== optionId)
				: checked
					? [optionId]
					: [];
		checkAnswers = {
			...checkAnswers,
			[question.id]: {
				...current,
				optionIds
			}
		};
	}

	function setCheckValue(questionId: string, value: string) {
		const current = getCheckAnswer(questionId);
		checkAnswers = {
			...checkAnswers,
			[questionId]: {
				...current,
				value
			}
		};
	}

	function questionHasAnswer(question: LessonCheckQuestion) {
		const answer = getCheckAnswer(question.id);
		if (
			question.mode === 'single_choice' ||
			question.mode === 'multiple_choice' ||
			question.mode === 'true_false'
		) {
			return answer.optionIds.length > 0;
		}
		if (question.mode === 'numeric') {
			return answer.value.trim() !== '' && Number.isFinite(Number(answer.value));
		}
		return answer.value.trim().length > 0;
	}

	function getCheckPayload() {
		if (!resolvedCheckBlock) return null;
		return {
			answers: checkQuestions.map((question: LessonCheckQuestion) => {
				const answer = getCheckAnswer(question.id);
				if (
					question.mode === 'single_choice' ||
					question.mode === 'multiple_choice' ||
					question.mode === 'true_false'
				) {
					return { questionId: question.id, optionIds: answer.optionIds };
				}
				if (question.mode === 'numeric') {
					return { questionId: question.id, value: Number(answer.value) };
				}
				return { questionId: question.id, value: answer.value };
			})
		};
	}

	const canSubmitCheck = $derived.by(() => {
		if (!resolvedCheckBlock || data.isReadOnly) return false;
		return (
			checkQuestions.length > 0 &&
			checkQuestions.every((question: LessonCheckQuestion) => questionHasAnswer(question))
		);
	});

	function getCheckQuestionResult(questionId: string) {
		return checkQuestionResults.find((result) => result.questionId === questionId);
	}

	function getCorrectAnswerLabel(question: LessonCheckQuestion) {
		if (question.mode === 'numeric') {
			if (question.acceptedExact !== null) return String(question.acceptedExact);
			const min = question.acceptedRange?.min;
			const max = question.acceptedRange?.max;
			if (min !== undefined && max !== undefined) return `${min} - ${max}`;
			if (min !== undefined) return `>= ${min}`;
			if (max !== undefined) return `<= ${max}`;
			return 'Rango configurado';
		}
		if (question.mode === 'short_text') return question.acceptedAnswers.join(', ');
		return question.options
			.filter((option) => question.correctOptionIds.includes(option.id))
			.map((option) => option.label)
			.join(', ');
	}

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

	async function handleYoutubeProgress(payload: {
		eventType: 'started' | 'pause_point_acknowledged' | 'completed';
		currentTime?: number;
		pausePointId?: string;
		duration?: number;
	}) {
		await postJson(
			`/api/lesson/${data.activity.id}/session/${data.session.id}/block/${data.currentBlock.id}/youtube-progress`,
			payload
		);
		if (payload.eventType === 'completed') {
			await invalidateAll();
		}
	}
</script>

{#snippet renderCheckQuestion(question: LessonCheckQuestion, index: number)}
	<fieldset class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
		<legend class="px-1 text-sm font-semibold text-gray-900 dark:text-white">
			{index + 1}. {question.prompt}
		</legend>

		{#if question.mode === 'single_choice' || question.mode === 'true_false'}
			<div class="mt-3 grid gap-3">
				{#each question.options as option (option.id)}
					<label
						class="hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 rounded-xl border border-gray-200 px-4 py-4 transition dark:border-gray-700"
					>
						<div class="flex items-start gap-3">
							<input
								type="radio"
								name={`check-${question.id}`}
								class="text-primary-600 mt-1 h-4 w-4 border-gray-300"
								checked={getCheckAnswer(question.id).optionIds.includes(option.id)}
								onchange={(event) =>
									toggleCheckOption(
										question,
										option.id,
										(event.currentTarget as HTMLInputElement).checked
									)}
								disabled={pending || data.isReadOnly || checkCanContinue}
							/>
							<span>
								<span class="block font-medium text-gray-900 dark:text-white">{option.label}</span>
								{#if option.description}
									<span class="mt-1 block text-sm text-gray-500 dark:text-gray-400">
										{option.description}
									</span>
								{/if}
							</span>
						</div>
					</label>
				{/each}
			</div>
		{:else if question.mode === 'multiple_choice'}
			<div class="mt-3 grid gap-3">
				{#each question.options as option (option.id)}
					<label
						class="hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 rounded-xl border border-gray-200 px-4 py-4 transition dark:border-gray-700"
					>
						<div class="flex items-start gap-3">
							<input
								type="checkbox"
								class="text-primary-600 mt-1 h-4 w-4 rounded border-gray-300"
								checked={getCheckAnswer(question.id).optionIds.includes(option.id)}
								onchange={(event) =>
									toggleCheckOption(
										question,
										option.id,
										(event.currentTarget as HTMLInputElement).checked
									)}
								disabled={pending || data.isReadOnly || checkCanContinue}
							/>
							<span>
								<span class="block font-medium text-gray-900 dark:text-white">{option.label}</span>
								{#if option.description}
									<span class="mt-1 block text-sm text-gray-500 dark:text-gray-400">
										{option.description}
									</span>
								{/if}
							</span>
						</div>
					</label>
				{/each}
			</div>
		{:else if question.mode === 'numeric'}
			<label class="mt-3 block">
				<span class="sr-only">{question.prompt}</span>
				<input
					type="number"
					class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
					value={getCheckAnswer(question.id).value}
					oninput={(event) =>
						setCheckValue(question.id, (event.currentTarget as HTMLInputElement).value)}
					placeholder="Escribe tu respuesta numérica"
					disabled={pending || data.isReadOnly || checkCanContinue}
				/>
			</label>
		{:else}
			<label class="mt-3 block">
				<span class="sr-only">{question.prompt}</span>
				<textarea
					class="min-h-28 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
					value={getCheckAnswer(question.id).value}
					oninput={(event) =>
						setCheckValue(question.id, (event.currentTarget as HTMLTextAreaElement).value)}
					placeholder="Escribe tu respuesta"
					disabled={pending || data.isReadOnly || checkCanContinue}
				></textarea>
			</label>
		{/if}

		{#if checkSubmitted}
			{@const result = getCheckQuestionResult(question.id)}
			<div class="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-950/30">
				<span
					class={result?.passed
						? 'font-medium text-emerald-700 dark:text-emerald-300'
						: 'font-medium text-amber-700 dark:text-amber-300'}
				>
					{result?.passed ? 'Correcta' : 'Revisar'}
				</span>
				<span class="text-gray-500 dark:text-gray-400">
					· score {typeof result?.score === 'number' ? result.score.toFixed(2) : '0.00'}
				</span>
				{#if resolvedCheckBlock?.checkConfig.revealCorrectAnswer}
					<p class="mt-1 text-gray-600 dark:text-gray-300">
						Respuesta esperada: {getCorrectAnswerLabel(question)}
					</p>
				{/if}
			</div>
		{/if}
	</fieldset>
{/snippet}

<div class="space-y-6">
	{#if showOverview}
		<div class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-900/40">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<button
					class="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
					onclick={goBack}
				>
					<ArrowLeft class="h-4 w-4" />
					{backLabel}
				</button>
				{#if data.canRestart}
					<button
						class="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
						onclick={restart}
						disabled={pending}
					>
						<RotateCcw class="h-4 w-4" />
						Reiniciar intento
					</button>
				{/if}
			</div>

			<div class="mt-4">
				<p class="text-sm tracking-wide text-amber-600 uppercase dark:text-amber-400">
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
						<span
							class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
						>
							Revisión #{data.sessionRevisionInfo.revisionNumber}
						</span>
					{/if}
					{#if data.sessionRevisionInfo.isHistoricalApproximation}
						<span
							class="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
						>
							Histórico aproximado
						</span>
					{/if}
				</div>
			</div>

			<div class="mt-4 flex flex-wrap gap-2">
				{#each data.definition.blocks as block (block.id)}
					{@const state = data.blockStates.find(
						(item: { blockId: string }) => item.blockId === block.id
					)}
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
	{/if}

	<div class="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900/40">
		<div class="mb-4">
			<p class="text-sm tracking-wide text-gray-500 uppercase">{data.currentBlock.kind}</p>
			<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
				{data.resolvedCurrentBlock.title}
			</h2>
		</div>

		{#if data.isReadOnly}
			<div
				class="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
			>
				Esta lesson está en modo solo lectura. Puedes revisar el contenido, pero no avanzar ni crear
				nuevas respuestas.
			</div>
		{/if}
		{#if data.sessionRevisionInfo.isPreview}
			<div
				class="mb-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:bg-sky-950/20 dark:text-sky-200"
			>
				Sesión aislada de preview. No modifica progreso, analítica ni revisión pedagógica del
				alumnado.
			</div>
		{/if}

		{#if errorMessage}
			<div
				class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
			>
				{errorMessage}
			</div>
		{/if}

		<div class="prose dark:prose-invert max-w-none">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html bodyHtml}
		</div>

		{#if data.currentAssets.length > 0}
			<div class="mt-6 grid gap-4 md:grid-cols-2">
				{#each data.currentAssets as asset (asset.fileId)}
					<div class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
						{#if asset.kind === 'image'}
							<img
								src={asset.url}
								alt={asset.name}
								class="max-h-80 w-full rounded-lg object-cover"
							/>
						{:else if asset.kind === 'video'}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video src={asset.url} controls class="w-full rounded-lg"></video>
						{:else if asset.kind === 'audio'}
							<audio src={asset.url} controls class="w-full"></audio>
						{:else}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={resolvePath(asset.url)}
								target="_blank"
								class="text-primary-600 hover:underline"
							>
								{asset.name}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
					class="bg-primary-600 hover:bg-primary-700 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
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
						class="hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 rounded-xl border border-gray-200 px-4 py-4 text-left transition dark:border-gray-700"
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
					{#if resolvedCheckBlock.checkConfig.presentationMode === 'step_by_step' && !checkSubmitted}
						{@const currentQuestion = checkQuestions[checkStepIndex]}
						{#if currentQuestion}
							<div class="flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
								<span>Pregunta {checkStepIndex + 1} de {checkQuestions.length}</span>
								<span>{checkAnsweredCount}/{checkQuestions.length} respondidas</span>
							</div>
							{@render renderCheckQuestion(currentQuestion, checkStepIndex)}

							<div class="flex flex-wrap items-center justify-between gap-3">
								<button
									type="button"
									class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
									onclick={() => (checkStepIndex = Math.max(checkStepIndex - 1, 0))}
									disabled={pending || checkStepIndex === 0}
								>
									Anterior
								</button>
								<button
									type="button"
									class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
									onclick={() =>
										(checkStepIndex = Math.min(checkStepIndex + 1, checkQuestions.length - 1))}
									disabled={pending || checkStepIndex >= checkQuestions.length - 1}
								>
									Siguiente
								</button>
							</div>
						{/if}
					{:else}
						<div class="space-y-4">
							{#each checkQuestions as question, index (question.id)}
								{@render renderCheckQuestion(question, index)}
							{/each}
						</div>
					{/if}

					{#if checkSubmitted}
						<div
							class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/30"
						>
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
								>
									Score: {Number.isFinite(checkScore) ? checkScore.toFixed(2) : '0.00'}
								</span>
								<span
									class="rounded-full px-2.5 py-1 text-xs font-medium {checkPassed
										? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
										: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}"
								>
									{checkPassed ? 'Superado' : 'Pendiente'}
								</span>
								<span
									class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
								>
									Intentos: {Number.isFinite(checkAttemptCount) ? checkAttemptCount : 0}
								</span>
								{#if checkAttemptsRemaining !== null}
									<span
										class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
									>
										Restantes: {checkAttemptsRemaining}
									</span>
								{/if}
								<span
									class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
								>
									Correctas: {Number.isFinite(checkCorrectCount) ? checkCorrectCount : 0}/{checkTotalQuestions}
								</span>
							</div>

							{#if checkFeedback}
								<p class="mt-3 text-sm text-gray-700 dark:text-gray-300">{checkFeedback}</p>
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
								class="bg-primary-600 hover:bg-primary-700 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
								onclick={submitCheck}
								disabled={pending || !canSubmitCheck}
							>
								{resolvedCheckBlock.checkConfig.submitLabel || 'Enviar'}
							</button>
						{/if}

						{#if checkCanContinue}
							<button
								class="bg-primary-600 hover:bg-primary-700 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
								onclick={advance}
								disabled={pending || data.isReadOnly}
							>
								{resolvedCheckBlock.checkConfig.continueLabel || 'Continuar'}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{:else if data.currentBlock.kind === 'youtube'}
			<div class="mt-6 space-y-4">
				{#if resolvedYoutubeBlock}
					{#key data.currentBlock.id}
						<LessonYoutubePlayer
							block={resolvedYoutubeBlock}
							outputs={currentOutputs}
							isReadOnly={data.isReadOnly}
							onProgress={handleYoutubeProgress}
						/>
					{/key}

					<div class="flex justify-end">
						<button
							class="bg-primary-600 hover:bg-primary-700 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
							onclick={advance}
							disabled={pending || data.isReadOnly || !youtubeCanContinue}
						>
							{resolvedYoutubeBlock.continueLabel || 'Continuar'}
						</button>
					</div>
				{/if}
			</div>
		{:else if data.currentBlock.kind === 'agent'}
			<div class="mt-6 space-y-4">
				{#if agentConfig}
					{#if agentUsesRuntime}
						<LessonAgentRuntimeChat
							initialMessages={data.currentAgentMessages}
							apiEndpoint={agentApiEndpoint}
							autoStartEnabled={agentConfig.autoStartOnEnter &&
								agentAutoStartStatus !== 'streaming' &&
								agentAutoStartStatus !== 'pending'}
							showComposer={agentConfig.interactionMode !== 'none'}
							composerDisabled={data.isReadOnly || !agentAllowsInput}
							composerPlaceholder={agentConfig.placeholder || 'Escribe tu respuesta'}
							onLoadingChange={handleAgentRuntimeLoadingChange}
							onComplete={handleAgentRuntimeComplete}
						/>
					{:else}
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
							autoStartEnabled={agentAutoStartStatus !== 'streaming' &&
								agentAutoStartStatus !== 'pending'}
							onStateChange={(state) => {
								agentRuntimeState = state;
							}}
						/>
					{/if}
				{/if}

				{#if agentAutoStartStatus === 'streaming' || agentAutoStartStatus === 'pending'}
					<div
						class="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200"
					>
						La IA está preparando el arranque automático de este bloque.
					</div>
				{:else if agentAutoStartStatus === 'failed'}
					<div
						class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
					>
						{agentAutoStartError || 'El arranque automático del bloque IA ha fallado.'}
					</div>
				{/if}

				{#if agentExtractionStatus === 'failed' || agentExtractionStatus === 'missing_field' || agentExtractionStatus === 'coerced'}
					<div
						class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
					>
						{agentExtractionMessage || 'La salida estructurada necesita revisión.'}
					</div>
				{/if}

				<div class="flex justify-end">
					<button
						class="bg-primary-600 hover:bg-primary-700 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
						onclick={advance}
						disabled={pending ||
							data.isReadOnly ||
							agentRuntimeState.isStreaming ||
							!agentCanContinue}
					>
						{agentConfig?.continueLabel || 'Continuar'}
					</button>
				</div>
			</div>
		{:else if data.currentBlock.kind === 'end'}
			<div class="mt-6 flex justify-end">
				<button
					class="bg-primary-600 hover:bg-primary-700 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
					onclick={goBack}
				>
					{resolvedEndBlock?.ctaLabel || backLabel}
				</button>
			</div>
		{/if}
	</div>
</div>
