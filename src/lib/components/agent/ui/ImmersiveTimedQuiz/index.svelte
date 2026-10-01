<script lang="ts">
	import { onDestroy } from 'svelte';
	import 'katex/dist/katex.min.css';
	import { renderMarkdownMath } from '$lib/utils';
	import { submitUIResponse } from '../shared/ui-response';
	import {
		buildTimedQuizPayload,
		buildTimedQuizQuestionResult,
		getTimedQuizScoreBadgeClass,
		parseInitialTimedQuizPayload,
		resolveTimedQuizConfig,
		type Difficulty,
		type FeedbackState,
		type TimedQuizPayload,
		type TimedQuizQuestion,
		type TimedQuizQuestionResult,
		type TimerByDifficultySec
	} from '../shared/timed-quiz';

	interface ImmersiveState {
		canCloseSafely: boolean;
		closePrompt?: string;
	}

	interface Props {
		instanceId: string;
		title?: string;
		questions: TimedQuizQuestion[];
		difficulty?: Difficulty;
		timerByDifficultySec?: TimerByDifficultySec;
		autoAdvanceDelayMs?: number;
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score: number) => void;
		onPersistedResponse?: (payload: Record<string, unknown>) => void;
		onImmersiveStateChange?: (state: ImmersiveState) => void;
	}

	let {
		instanceId,
		title,
		questions,
		difficulty,
		timerByDifficultySec,
		autoAdvanceDelayMs,
		interactive: initialInteractive,
		initialUserResponse,
		apiBase,
		onRespond,
		onPersistedResponse,
		onImmersiveStateChange
	}: Props = $props();

	function createResolvedConfig() {
		return resolveTimedQuizConfig({
			difficulty,
			timerByDifficultySec,
			autoAdvanceDelayMs
		});
	}

	const resolvedConfig = createResolvedConfig();

	function createInitialPayload() {
		return parseInitialTimedQuizPayload(
			initialUserResponse,
			questions,
			resolvedConfig.resolvedDifficulty,
			resolvedConfig.timePerQuestionSec
		);
	}

	const initialPayload = createInitialPayload();

	let phase = $state<'intro' | 'playing' | 'results'>(initialPayload ? 'results' : 'intro');
	let interactive = $state((() => initialInteractive && !initialPayload)());
	let submitted = $state(!!initialPayload);
	let isSubmitting = $state(false);
	let submitError = $state('');
	let currentIndex = $state(0);
	let feedbackState = $state<FeedbackState>(null);
	let isAdvancing = $state(false);
	let timeLeftMs = $state(resolvedConfig.timePerQuestionSec * 1000);
	let questionStartedAtMs = $state<number | null>(null);
	let questionDeadlineMs = $state<number | null>(null);
	let timerHandle: ReturnType<typeof setInterval> | null = null;
	let advanceHandle: ReturnType<typeof setTimeout> | null = null;
	let answers = $state<number[]>((() => initialPayload?.answers ?? questions.map(() => -1))());
	let questionResults = $state<Array<TimedQuizQuestionResult | null>>(
		(() => (initialPayload ? [...initialPayload.questionResults] : questions.map(() => null)))()
	);
	let pendingPayload = $state<TimedQuizPayload | null>(initialPayload);

	const safeCurrentIndex = $derived(
		Math.min(Math.max(currentIndex, 0), Math.max(questions.length - 1, 0))
	);
	const currentQuestion = $derived(questions[safeCurrentIndex]);
	const timerPercent = $derived(
		Math.max(
			0,
			Math.min(
				100,
				Math.round((timeLeftMs / (resolvedConfig.timePerQuestionSec * 1000)) * 100)
			)
		)
	);
	const progressPercent = $derived(
		questions.length > 0
			? Math.round(
					(((phase === 'results' ? questions.length : safeCurrentIndex) + (phase === 'playing' ? 1 : 0)) /
						questions.length) *
						100
				)
			: 0
	);
	const resultPayload = $derived(
		initialPayload ??
			buildTimedQuizPayload({
				questions,
				answers,
				questionResults,
				difficulty: resolvedConfig.resolvedDifficulty,
				timePerQuestionSec: resolvedConfig.timePerQuestionSec
			})
	);
	const scorePercent = $derived(Math.round(resultPayload.score * 100));

	function clearTimer() {
		if (timerHandle !== null) {
			clearInterval(timerHandle);
			timerHandle = null;
		}
	}

	function clearAdvanceTimeout() {
		if (advanceHandle !== null) {
			clearTimeout(advanceHandle);
			advanceHandle = null;
		}
	}

	function setImmersiveState() {
		onImmersiveStateChange?.({
			canCloseSafely: phase !== 'playing',
			closePrompt: 'Si sales ahora se perdera la partida en curso. ¿Quieres cerrar?'
		});
	}

	function resetSessionState() {
		clearTimer();
		clearAdvanceTimeout();
		submitted = false;
		interactive = initialInteractive && !initialPayload;
		submitError = '';
		currentIndex = 0;
		feedbackState = null;
		isAdvancing = false;
		answers = questions.map(() => -1);
		questionResults = questions.map(() => null);
		pendingPayload = null;
		timeLeftMs = resolvedConfig.timePerQuestionSec * 1000;
		questionStartedAtMs = null;
		questionDeadlineMs = null;
	}

	function startTimerForCurrentQuestion() {
		if (!interactive || phase !== 'playing' || !currentQuestion) return;

		clearTimer();
		const now = Date.now();
		questionStartedAtMs = now;
		questionDeadlineMs = now + resolvedConfig.timePerQuestionSec * 1000;
		timeLeftMs = resolvedConfig.timePerQuestionSec * 1000;

		timerHandle = setInterval(() => {
			if (questionDeadlineMs === null) return;
			const remaining = questionDeadlineMs - Date.now();
			timeLeftMs = Math.max(0, remaining);

			if (remaining <= 0) {
				clearTimer();
				handleTimeout();
			}
		}, 100);
	}

	function scheduleAdvance() {
		clearAdvanceTimeout();
		advanceHandle = setTimeout(() => {
			void advanceOrComplete();
		}, resolvedConfig.autoAdvanceMs);
	}

	function commitResult(result: TimedQuizQuestionResult) {
		answers = answers.map((answer, index) => (index === safeCurrentIndex ? result.selectedIndex : answer));
		questionResults = questionResults.map((entry, index) => (index === safeCurrentIndex ? result : entry));
	}

	function startGame() {
		resetSessionState();

		if (questions.length === 0) {
			phase = 'results';
			pendingPayload = resultPayload;
			void persistPayload(resultPayload);
			setImmersiveState();
			return;
		}

		phase = 'playing';
		setImmersiveState();
		startTimerForCurrentQuestion();
	}

	function selectAnswer(optionIndex: number) {
		if (!interactive || phase !== 'playing' || !currentQuestion || isSubmitting || isAdvancing) return;
		if (optionIndex < 0 || optionIndex >= currentQuestion.options.length) return;

		clearTimer();
		const responseMs =
			questionStartedAtMs !== null ? Math.max(0, Date.now() - questionStartedAtMs) : null;

		const result = buildTimedQuizQuestionResult(currentQuestion, optionIndex, { responseMs });
		commitResult(result);
		feedbackState = result.isCorrect ? 'correct' : 'incorrect';
		isAdvancing = true;
		scheduleAdvance();
	}

	function handleTimeout() {
		if (!interactive || phase !== 'playing' || !currentQuestion || isSubmitting || isAdvancing) return;

		const result = buildTimedQuizQuestionResult(currentQuestion, -1, {
			timedOut: true,
			responseMs: null
		});
		commitResult(result);
		feedbackState = 'timeout';
		isAdvancing = true;
		scheduleAdvance();
	}

	async function persistPayload(payload: TimedQuizPayload) {
		isSubmitting = true;
		submitError = '';

		const result = await submitUIResponse({
			apiBase,
			instanceId,
			componentKey: 'ImmersiveTimedQuiz',
			payload
		});

		if (!result.ok) {
			submitError = result.errorMessage ?? 'No se pudo guardar tu resultado. Reintenta el envio.';
			isSubmitting = false;
			return;
		}

		submitted = true;
		interactive = false;
		pendingPayload = payload;
		onPersistedResponse?.(payload as unknown as Record<string, unknown>);
		onRespond?.(payload.score);
		isSubmitting = false;
	}

	async function advanceOrComplete() {
		clearAdvanceTimeout();

		if (safeCurrentIndex < questions.length - 1) {
			currentIndex = safeCurrentIndex + 1;
			feedbackState = null;
			isAdvancing = false;
			timeLeftMs = resolvedConfig.timePerQuestionSec * 1000;
			questionStartedAtMs = null;
			questionDeadlineMs = null;
			startTimerForCurrentQuestion();
			return;
		}

		clearTimer();
		phase = 'results';
		interactive = false;
		isAdvancing = false;
		feedbackState = null;
		setImmersiveState();

		const payload = buildTimedQuizPayload({
			questions,
			answers,
			questionResults,
			difficulty: resolvedConfig.resolvedDifficulty,
			timePerQuestionSec: resolvedConfig.timePerQuestionSec
		});
		pendingPayload = payload;
		await persistPayload(payload);
	}

	async function retrySubmit() {
		if (!pendingPayload || submitted || isSubmitting) return;
		await persistPayload(pendingPayload);
	}

	function renderInline(content: string): string {
		return renderMarkdownMath(content ?? '', { inline: true });
	}

	function renderBlock(content: string): string {
		return renderMarkdownMath(content ?? '');
	}

	function getTimerToneClass(percent: number): string {
		if (percent <= 20) return 'bg-rose-500';
		if (percent <= 45) return 'bg-amber-400';
		return 'bg-emerald-400';
	}

	function getOptionClass(optionIndex: number): string {
		if (!feedbackState) {
			return 'border-cyan-300/40 bg-white/10 text-white hover:border-cyan-200 hover:bg-white/16';
		}

		const isCorrect = optionIndex === (currentQuestion?.correctIndex ?? -1);
		const selected = answers[safeCurrentIndex] === optionIndex;

		if (isCorrect) return 'border-emerald-300 bg-emerald-400/20 text-emerald-50';
		if (selected) return 'border-rose-300 bg-rose-500/20 text-rose-50';
		return 'border-white/10 bg-white/5 text-slate-400';
	}

	function getFeedbackText(): string {
		if (feedbackState === 'correct') return 'Respuesta correcta';
		if (feedbackState === 'incorrect') return 'Respuesta incorrecta';
		if (feedbackState === 'timeout') return 'Tiempo agotado';
		return 'Selecciona una respuesta antes de que el tiempo llegue a cero.';
	}

	function getFeedbackClass(): string {
		if (feedbackState === 'correct') return 'text-emerald-300';
		if (feedbackState === 'incorrect') return 'text-rose-300';
		if (feedbackState === 'timeout') return 'text-amber-300';
		return 'text-slate-300';
	}

	$effect(() => {
		setImmersiveState();
	});

	onDestroy(() => {
		clearTimer();
		clearAdvanceTimeout();
	});
</script>

<div class="min-h-full rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.22),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] text-white shadow-2xl">
	{#if phase === 'intro'}
		<div class="grid min-h-[70vh] gap-8 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-10">
			<div class="flex flex-col justify-center">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Modo arcade</p>
				<h3 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{title ?? 'Quiz Contrarreloj Arcade'}</h3>
				<p class="mt-4 max-w-2xl text-lg leading-8 text-slate-200">
					Una experiencia a pantalla completa con cuenta atras, feedback instantaneo y botones grandes para responder rapido.
				</p>

				<div class="mt-8 grid gap-3 sm:grid-cols-3">
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Preguntas</p>
						<p class="mt-2 text-3xl font-black">{questions.length}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Dificultad</p>
						<p class="mt-2 text-3xl font-black capitalize">{resolvedConfig.resolvedDifficulty}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Tiempo</p>
						<p class="mt-2 text-3xl font-black">{resolvedConfig.timePerQuestionSec}s</p>
					</div>
				</div>

				<div class="mt-8 flex flex-wrap gap-3">
					<button
						type="button"
						class="rounded-2xl bg-cyan-400 px-6 py-3 text-base font-black text-slate-950 transition-colors hover:bg-cyan-300"
						onclick={startGame}
					>
						Empezar partida
					</button>
					<div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
						El temporizador empieza solo cuando pulses el boton.
					</div>
				</div>
			</div>

			<div class="rounded-[2rem] border border-cyan-400/20 bg-slate-950/70 p-6 shadow-[0_0_80px_rgba(34,211,238,0.12)]">
				<p class="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">Como funciona</p>
				<div class="mt-5 space-y-4 text-base text-slate-200">
					<p>1. Lee la pregunta en grande y elige una opcion antes de que expire el tiempo.</p>
					<p>2. Cada acierto o error se marca al instante y el juego avanza automaticamente.</p>
					<p>3. Al final veras un resumen completo con score, aciertos y timeouts.</p>
				</div>
			</div>
		</div>
	{:else if phase === 'playing' && currentQuestion}
		<div class="flex min-h-[70vh] flex-col px-5 py-5 sm:px-8 sm:py-8">
			<div class="grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/6 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
				<div>
					<div class="flex flex-wrap items-center gap-3">
						<p class="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">Partida en curso</p>
						<span class="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold capitalize">
							{resolvedConfig.resolvedDifficulty}
						</span>
					</div>
					<h3 class="mt-2 text-2xl font-black sm:text-3xl">{title ?? 'Quiz Contrarreloj Arcade'}</h3>
				</div>

				<div class="rounded-3xl border border-cyan-300/20 bg-slate-950/60 px-5 py-3 text-center shadow-inner">
					<p class="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Tiempo restante</p>
					<p class="mt-1 text-4xl font-black">{Math.ceil(timeLeftMs / 1000)}s</p>
				</div>
			</div>

			<div class="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
				<div>
					<div class="mb-2 flex items-center justify-between text-sm text-slate-300">
						<span>Progreso</span>
						<span>{safeCurrentIndex + 1}/{questions.length}</span>
					</div>
					<div class="h-3 overflow-hidden rounded-full bg-white/10">
						<div
							class="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
							style="width: {progressPercent}%"
						></div>
					</div>
				</div>

				<div class="h-3 w-full overflow-hidden rounded-full bg-white/10 sm:w-64">
					<div
						class="h-full transition-all duration-100 {getTimerToneClass(timerPercent)}"
						style="width: {timerPercent}%"
					></div>
				</div>
			</div>

			<div class="mt-6 flex flex-1 flex-col rounded-[2rem] border border-white/10 bg-slate-950/60 p-5 shadow-[0_24px_120px_rgba(15,23,42,0.7)] sm:p-8">
				<p class="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">Pregunta {safeCurrentIndex + 1}</p>
				<div class="mt-4 text-3xl font-black leading-tight sm:text-5xl">
					<span class="[&_p]:inline [&_.katex-display]:inline [&_.katex-display]:m-0">
						{@html renderInline(currentQuestion.question)}
					</span>
				</div>

				<div class="mt-8 grid flex-1 gap-4 lg:grid-cols-2">
					{#each currentQuestion.options as option, optionIndex}
						<button
							type="button"
							class="min-h-28 rounded-[1.5rem] border px-5 py-5 text-left text-xl font-semibold transition-all sm:min-h-32 sm:px-6 sm:text-2xl {getOptionClass(optionIndex)}"
							disabled={feedbackState !== null || isSubmitting || isAdvancing}
							onclick={() => selectAnswer(optionIndex)}
						>
							<div class="flex gap-4">
								<span class="text-cyan-200">{String.fromCharCode(65 + optionIndex)}.</span>
								<span class="[&_p]:inline">{@html renderInline(option)}</span>
							</div>
						</button>
					{/each}
				</div>

				<div class="mt-5 text-base font-semibold sm:text-lg {getFeedbackClass()}">{getFeedbackText()}</div>
			</div>
		</div>
	{:else}
		<div class="px-5 py-6 sm:px-8 sm:py-8">
			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 sm:p-8">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p class="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">Resultado final</p>
						<h3 class="mt-2 text-3xl font-black sm:text-4xl">{title ?? 'Quiz Contrarreloj Arcade'}</h3>
					</div>
					<div class="rounded-full px-4 py-2 text-base font-black {getTimedQuizScoreBadgeClass(scorePercent)}">
						{scorePercent}%
					</div>
				</div>

				<div class="mt-6 grid gap-3 md:grid-cols-4">
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Correctas</p>
						<p class="mt-2 text-3xl font-black">{resultPayload.correctCount}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Timeouts</p>
						<p class="mt-2 text-3xl font-black">{resultPayload.timeoutCount}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Incorrectas</p>
						<p class="mt-2 text-3xl font-black">{questions.length - resultPayload.correctCount - resultPayload.timeoutCount}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Tiempo/pregunta</p>
						<p class="mt-2 text-3xl font-black">{resultPayload.timePerQuestionSec}s</p>
					</div>
				</div>

				{#if submitError}
					<div class="mt-5 rounded-3xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
						{submitError}
						<div class="mt-3">
							<button
								type="button"
								class="rounded-2xl bg-rose-500 px-4 py-2 font-semibold text-white hover:bg-rose-400"
								disabled={isSubmitting || submitted}
								onclick={retrySubmit}
							>
								{isSubmitting ? 'Reintentando...' : 'Reintentar envio'}
							</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="mt-6 space-y-3">
				{#each questions as question, index}
					{@const result = resultPayload.questionResults[index]}
					<div class="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-5">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<p class="text-lg font-semibold text-white">
								{index + 1}. <span class="[&_p]:inline [&_.katex-display]:inline [&_.katex-display]:m-0">{@html renderInline(question.question)}</span>
							</p>

							<span class="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]
								{result.timedOut ? 'bg-amber-400/15 text-amber-200' : result.isCorrect ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/15 text-rose-200'}">
								{result.timedOut ? 'Timeout' : result.isCorrect ? 'Correcta' : 'Incorrecta'}
							</span>
						</div>

						<div class="mt-4 grid gap-3 md:grid-cols-2">
							<div class="rounded-3xl border border-white/10 bg-white/5 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Tu respuesta</p>
								<p class="mt-2 text-base text-slate-100">
									{#if result.selectedIndex >= 0}
										{String.fromCharCode(65 + result.selectedIndex)}.
										<span class="[&_p]:inline">{@html renderInline(question.options[result.selectedIndex] ?? '')}</span>
									{:else}
										Sin respuesta
									{/if}
								</p>
							</div>

							<div class="rounded-3xl border border-white/10 bg-white/5 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Correcta</p>
								<p class="mt-2 text-base text-slate-100">
									{String.fromCharCode(65 + result.correctIndex)}.
									<span class="[&_p]:inline">{@html renderInline(question.options[result.correctIndex] ?? '')}</span>
								</p>
							</div>
						</div>

						{#if question.explanation}
							<div class="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 [&_p]:m-0">
								{@html renderBlock(question.explanation)}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
