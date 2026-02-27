<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import 'katex/dist/katex.min.css';
	import { renderMarkdownMath } from '$lib/utils';

	type Difficulty = 'easy' | 'medium' | 'hard';
	type FeedbackState = 'correct' | 'incorrect' | 'timeout' | null;

	interface Question {
		question: string;
		options: string[];
		correctIndex: number;
		explanation?: string;
	}

	interface QuestionResult {
		selectedIndex: number;
		correctIndex: number;
		isCorrect: boolean;
		timedOut: boolean;
		responseMs: number | null;
	}

	interface TimedQuizPayload {
		answers: number[];
		difficulty: Difficulty;
		timePerQuestionSec: number;
		questionResults: QuestionResult[];
		correctCount: number;
		timeoutCount: number;
		score: number;
		completed: true;
	}

	interface TimerByDifficultySec {
		easy?: number;
		medium?: number;
		hard?: number;
	}

	interface Props {
		instanceId: string;
		title?: string;
		questions: Question[];
		difficulty?: Difficulty;
		timerByDifficultySec?: TimerByDifficultySec;
		autoAdvanceDelayMs?: number;
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score: number) => void;
	}

	const DEFAULT_TIMERS: Record<Difficulty, number> = {
		easy: 30,
		medium: 20,
		hard: 12
	};

	const MIN_TIMER_SEC = 3;
	const MAX_TIMER_SEC = 300;
	const MIN_AUTO_ADVANCE_MS = 150;
	const MAX_AUTO_ADVANCE_MS = 4000;

	let {
		instanceId,
		title,
		questions,
		difficulty = 'medium',
		timerByDifficultySec,
		autoAdvanceDelayMs = 700,
		interactive: initialInteractive,
		initialUserResponse,
		apiBase,
		onRespond
	}: Props = $props();

	function resolveDifficulty(value: unknown): Difficulty {
		if (value === 'easy' || value === 'medium' || value === 'hard') return value;
		return 'medium';
	}

	function sanitizeTimerSeconds(value: unknown, fallback: number): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
		const rounded = Math.round(value);
		if (rounded < MIN_TIMER_SEC) return MIN_TIMER_SEC;
		if (rounded > MAX_TIMER_SEC) return MAX_TIMER_SEC;
		return rounded;
	}

	function sanitizeAutoAdvanceMs(value: unknown): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) return 700;
		const rounded = Math.round(value);
		if (rounded < MIN_AUTO_ADVANCE_MS) return MIN_AUTO_ADVANCE_MS;
		if (rounded > MAX_AUTO_ADVANCE_MS) return MAX_AUTO_ADVANCE_MS;
		return rounded;
	}

	const resolvedDifficulty = resolveDifficulty(difficulty);
	const resolvedTimers = {
		easy: sanitizeTimerSeconds(timerByDifficultySec?.easy, DEFAULT_TIMERS.easy),
		medium: sanitizeTimerSeconds(timerByDifficultySec?.medium, DEFAULT_TIMERS.medium),
		hard: sanitizeTimerSeconds(timerByDifficultySec?.hard, DEFAULT_TIMERS.hard)
	} satisfies Record<Difficulty, number>;

	const timePerQuestionSec = resolvedTimers[resolvedDifficulty];
	const autoAdvanceMs = sanitizeAutoAdvanceMs(autoAdvanceDelayMs);

	function parseInitialPayload(
		value: Record<string, unknown> | undefined
	): TimedQuizPayload | null {
		if (!value) return null;

		const rawAnswers = Array.isArray(value.answers) ? value.answers : [];
		const normalizedAnswers = questions.map((q, i) => {
			const raw = rawAnswers[i];
			if (typeof raw !== 'number' || !Number.isFinite(raw)) return -1;
			const rounded = Math.round(raw);
			if (rounded < -1) return -1;
			if (rounded >= q.options.length) return -1;
			return rounded;
		});

		const rawResults = Array.isArray(value.questionResults) ? value.questionResults : [];
		const normalizedResults = questions.map((q, i) => {
			const raw = rawResults[i];
			if (!raw || typeof raw !== 'object') {
				const selectedIndex = normalizedAnswers[i];
				return {
					selectedIndex,
					correctIndex: q.correctIndex,
					isCorrect: selectedIndex === q.correctIndex,
					timedOut: selectedIndex < 0,
					responseMs: null
				} satisfies QuestionResult;
			}

			const record = raw as Record<string, unknown>;
			const selectedRaw = record.selectedIndex;
			const selectedIndex =
				typeof selectedRaw === 'number' && Number.isFinite(selectedRaw)
					? Math.round(selectedRaw)
					: normalizedAnswers[i];

			const safeSelected =
				selectedIndex < -1 || selectedIndex >= q.options.length ? -1 : selectedIndex;

			const responseRaw = record.responseMs;
			const responseMs =
				typeof responseRaw === 'number' && Number.isFinite(responseRaw) && responseRaw >= 0
					? Math.round(responseRaw)
					: null;

			return {
				selectedIndex: safeSelected,
				correctIndex: q.correctIndex,
				isCorrect: safeSelected === q.correctIndex,
				timedOut: record.timedOut === true || safeSelected < 0,
				responseMs
			} satisfies QuestionResult;
		});

		const correctCount = normalizedResults.filter((r) => r.isCorrect).length;
		const timeoutCount = normalizedResults.filter((r) => r.timedOut).length;
		const score = questions.length > 0 ? correctCount / questions.length : 0;

		return {
			answers: normalizedAnswers,
			difficulty: resolveDifficulty(value.difficulty),
			timePerQuestionSec:
				typeof value.timePerQuestionSec === 'number' && Number.isFinite(value.timePerQuestionSec)
					? sanitizeTimerSeconds(value.timePerQuestionSec, timePerQuestionSec)
					: timePerQuestionSec,
			questionResults: normalizedResults,
			correctCount,
			timeoutCount,
			score,
			completed: true
		};
	}

	const initialPayload = parseInitialPayload(initialUserResponse);

	let submitted = $state(!!initialPayload);
	let interactive = $state(initialInteractive && !initialPayload);
	let finishedSequence = $state(!!initialPayload);
	let isSubmitting = $state(false);
	let submitError = $state('');

	let currentIndex = $state(0);
	let feedbackState = $state<FeedbackState>(null);
	let isAdvancing = $state(false);

	let timeLeftMs = $state(timePerQuestionSec * 1000);
	let questionStartedAtMs = $state<number | null>(null);
	let questionDeadlineMs = $state<number | null>(null);
	let timerHandle: ReturnType<typeof setInterval> | null = null;
	let advanceHandle: ReturnType<typeof setTimeout> | null = null;

	let answers = $state<number[]>(initialPayload?.answers ?? questions.map(() => -1));
	let questionResults = $state<(QuestionResult | null)[]>(
		initialPayload ? [...initialPayload.questionResults] : questions.map(() => null)
	);
	let pendingPayload = $state<TimedQuizPayload | null>(initialPayload);

	const hasQuestions = $derived(questions.length > 0);
	const safeCurrentIndex = $derived(
		Math.min(Math.max(currentIndex, 0), Math.max(questions.length - 1, 0))
	);
	const currentQuestion = $derived(questions[safeCurrentIndex]);

	const progressPercent = $derived(
		questions.length > 0
			? Math.round(
					((finishedSequence ? questions.length : safeCurrentIndex + 1) / questions.length) * 100
				)
			: 0
	);

	const timerPercent = $derived(
		Math.max(0, Math.min(100, Math.round((timeLeftMs / (timePerQuestionSec * 1000)) * 100)))
	);

	const computedResults = $derived(
		questions.map((q, i) => {
			const stored = questionResults[i];
			if (stored) return stored;

			const selected = answers[i] ?? -1;
			return {
				selectedIndex: selected,
				correctIndex: q.correctIndex,
				isCorrect: selected === q.correctIndex,
				timedOut: selected < 0,
				responseMs: null
			} satisfies QuestionResult;
		})
	);

	const correctCount = $derived(computedResults.filter((r) => r.isCorrect).length);
	const timeoutCount = $derived(computedResults.filter((r) => r.timedOut).length);
	const score = $derived(questions.length > 0 ? correctCount / questions.length : 0);
	const scorePercent = $derived(Math.round(score * 100));
	const selectedCurrentAnswer = $derived(answers[safeCurrentIndex] ?? -1);

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

	function startTimerForCurrentQuestion() {
		if (!interactive || submitted || finishedSequence || !hasQuestions) return;
		clearTimer();

		const now = Date.now();
		questionStartedAtMs = now;
		questionDeadlineMs = now + timePerQuestionSec * 1000;
		timeLeftMs = timePerQuestionSec * 1000;

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
		}, autoAdvanceMs);
	}

	function commitResult(result: QuestionResult) {
		answers = answers.map((answer, idx) =>
			idx === safeCurrentIndex ? result.selectedIndex : answer
		);
		questionResults = questionResults.map((item, idx) =>
			idx === safeCurrentIndex ? result : item
		);
	}

	function selectAnswer(optionIndex: number) {
		if (!interactive || submitted || finishedSequence || isSubmitting || isAdvancing) return;
		if (!currentQuestion || optionIndex < 0 || optionIndex >= currentQuestion.options.length)
			return;

		clearTimer();
		const responseMs =
			questionStartedAtMs !== null ? Math.max(0, Date.now() - questionStartedAtMs) : null;

		const result: QuestionResult = {
			selectedIndex: optionIndex,
			correctIndex: currentQuestion.correctIndex,
			isCorrect: optionIndex === currentQuestion.correctIndex,
			timedOut: false,
			responseMs
		};

		commitResult(result);
		feedbackState = result.isCorrect ? 'correct' : 'incorrect';
		isAdvancing = true;
		scheduleAdvance();
	}

	function handleTimeout() {
		if (!interactive || submitted || finishedSequence || isSubmitting || isAdvancing) return;
		if (!currentQuestion) return;

		const result: QuestionResult = {
			selectedIndex: -1,
			correctIndex: currentQuestion.correctIndex,
			isCorrect: false,
			timedOut: true,
			responseMs: null
		};

		commitResult(result);
		feedbackState = 'timeout';
		isAdvancing = true;
		scheduleAdvance();
	}

	function buildPayload(): TimedQuizPayload {
		const finalizedResults = questions.map((q, i) => {
			const stored = questionResults[i];
			if (stored) return stored;

			const selected = answers[i] ?? -1;
			return {
				selectedIndex: selected,
				correctIndex: q.correctIndex,
				isCorrect: selected === q.correctIndex,
				timedOut: selected < 0,
				responseMs: null
			} satisfies QuestionResult;
		});

		const finalCorrect = finalizedResults.filter((r) => r.isCorrect).length;
		const finalTimeout = finalizedResults.filter((r) => r.timedOut).length;
		const finalScore = questions.length > 0 ? finalCorrect / questions.length : 0;

		return {
			answers: finalizedResults.map((r) => r.selectedIndex),
			difficulty: resolvedDifficulty,
			timePerQuestionSec,
			questionResults: finalizedResults,
			correctCount: finalCorrect,
			timeoutCount: finalTimeout,
			score: finalScore,
			completed: true
		};
	}

	async function persistPayload(payload: TimedQuizPayload) {
		isSubmitting = true;
		submitError = '';
		try {
			const res = await fetch(`${apiBase}/ui-response`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					instanceId,
					componentKey: 'TimedQuizCard',
					payload
				})
			});

			if (!res.ok) {
				submitError = 'No se pudo guardar tu resultado. Reintenta el envio.';
				return;
			}

			submitted = true;
			interactive = false;
			onRespond?.(payload.score);
		} catch {
			submitError = 'No se pudo guardar tu resultado. Reintenta el envio.';
		} finally {
			isSubmitting = false;
		}
	}

	async function advanceOrComplete() {
		clearAdvanceTimeout();

		if (safeCurrentIndex < questions.length - 1) {
			currentIndex = safeCurrentIndex + 1;
			feedbackState = null;
			isAdvancing = false;
			timeLeftMs = timePerQuestionSec * 1000;
			questionStartedAtMs = null;
			questionDeadlineMs = null;
			startTimerForCurrentQuestion();
			return;
		}

		clearTimer();
		finishedSequence = true;
		interactive = false;
		isAdvancing = false;
		feedbackState = null;

		const payload = buildPayload();
		pendingPayload = payload;
		await persistPayload(payload);
	}

	async function retrySubmit() {
		if (!pendingPayload || isSubmitting || submitted) return;
		await persistPayload(pendingPayload);
	}

	function renderInline(content: string): string {
		return renderMarkdownMath(content ?? '', { inline: true });
	}

	function renderBlock(content: string): string {
		return renderMarkdownMath(content ?? '');
	}

	function getTimerToneClass(percent: number): string {
		if (percent <= 20) return 'bg-red-500';
		if (percent <= 45) return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	function getCurrentOptionClass(optionIndex: number): string {
		if (!feedbackState) {
			const isSelected = selectedCurrentAnswer === optionIndex;
			return isSelected
				? 'border-cyan-400 bg-cyan-100 text-cyan-900 dark:border-cyan-300 dark:bg-cyan-900/70 dark:text-cyan-100'
				: 'border-slate-300 bg-white/90 hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-cyan-500 dark:hover:bg-slate-800';
		}

		const isCorrect = optionIndex === (currentQuestion?.correctIndex ?? -1);
		const isSelected = selectedCurrentAnswer === optionIndex;

		if (isCorrect) {
			return 'border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/50 dark:text-emerald-100';
		}
		if (isSelected && !isCorrect) {
			return 'border-rose-500 bg-rose-100 text-rose-900 dark:border-rose-400 dark:bg-rose-900/50 dark:text-rose-100';
		}
		return 'border-slate-300 bg-slate-100/80 text-slate-500 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400 opacity-80';
	}

	function getScoreBadgeClass(percent: number): string {
		if (percent >= 80)
			return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
		if (percent >= 60)
			return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
		return 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300';
	}

	function getFeedbackText(): string {
		if (feedbackState === 'correct') return 'Respuesta correcta';
		if (feedbackState === 'incorrect') return 'Respuesta incorrecta';
		if (feedbackState === 'timeout') return 'Tiempo agotado';
		return '';
	}

	function getFeedbackClass(): string {
		if (feedbackState === 'correct') return 'text-emerald-600 dark:text-emerald-300';
		if (feedbackState === 'incorrect') return 'text-rose-600 dark:text-rose-300';
		if (feedbackState === 'timeout') return 'text-amber-600 dark:text-amber-300';
		return 'text-slate-500 dark:text-slate-400';
	}

	onMount(() => {
		if (!interactive || submitted || finishedSequence) return;

		if (hasQuestions) {
			startTimerForCurrentQuestion();
			return;
		}

		finishedSequence = true;
		interactive = false;
		const payload = buildPayload();
		pendingPayload = payload;
		void persistPayload(payload);
	});

	onDestroy(() => {
		clearTimer();
		clearAdvanceTimeout();
	});
</script>

<div
	class="my-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
>
	<div
		class="border-b border-slate-200 bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-white dark:border-slate-700"
	>
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<span
					class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm font-bold"
				>
					Q
				</span>
				<div>
					<p class="text-sm font-semibold">{title ?? 'Timed Quiz'}</p>
					<p class="text-[11px] tracking-wide text-cyan-100 uppercase">
						Dificultad {resolvedDifficulty} - {timePerQuestionSec}s por pregunta
					</p>
				</div>
			</div>
			{#if finishedSequence}
				<span
					class="rounded-full px-2.5 py-1 text-xs font-semibold {getScoreBadgeClass(scorePercent)}"
				>
					{scorePercent}%
				</span>
			{:else}
				<span class="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium">
					{safeCurrentIndex + 1}/{questions.length}
				</span>
			{/if}
		</div>

		<div class="mt-3">
			<div class="mb-1 flex items-center justify-between text-[11px] text-cyan-100">
				<span>Progreso</span>
				<span>{progressPercent}%</span>
			</div>
			<div class="h-1.5 overflow-hidden rounded-full bg-white/30">
				<div
					class="h-full rounded-full bg-white transition-all duration-300"
					style="width: {progressPercent}%"
				></div>
			</div>
		</div>
	</div>

	{#if !hasQuestions}
		<div class="px-4 py-6 text-sm text-slate-600 dark:text-slate-300">
			No hay preguntas disponibles para este quiz.
		</div>
	{:else if !finishedSequence}
		<div class="px-4 py-4">
			<div
				class="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70"
			>
				<div class="mb-2 flex items-center justify-between gap-3">
					<p class="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-300">
						Tiempo restante
					</p>
					<p class="text-sm font-semibold text-slate-700 dark:text-slate-100">
						{Math.ceil(timeLeftMs / 1000)}s
					</p>
				</div>
				<div class="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
					<div
						class="h-full transition-all duration-100 {getTimerToneClass(timerPercent)}"
						style="width: {timerPercent}%"
					></div>
				</div>
			</div>

			<div
				class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40"
			>
				<p class="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
					{safeCurrentIndex + 1}.
					<span class="[&_p]:inline [&_.katex-display]:inline [&_.katex-display]:m-0">
						{@html renderInline(currentQuestion.question)}
					</span>
				</p>

				<div class="space-y-2">
					{#each currentQuestion.options as option, optionIndex}
						<button
							class="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors {getCurrentOptionClass(
								optionIndex
							)}"
							onclick={() => selectAnswer(optionIndex)}
							disabled={isAdvancing || isSubmitting || feedbackState !== null}
						>
							<span class="mr-2 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
							<span class="[&_p]:inline">{@html renderInline(option)}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="mt-3 min-h-5 text-xs font-medium {getFeedbackClass()}">
				{getFeedbackText()}
			</div>
		</div>
	{:else}
		<div class="px-4 py-4">
			<div
				class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<p class="text-sm font-semibold text-slate-900 dark:text-slate-100">Resultado final</p>
					<span
						class="rounded-full px-2.5 py-1 text-xs font-semibold {getScoreBadgeClass(
							scorePercent
						)}"
					>
						{scorePercent}% ({correctCount}/{questions.length})
					</span>
				</div>
				<div class="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3 dark:text-slate-300">
					<p class="rounded-lg bg-white px-2.5 py-2 dark:bg-slate-900/60">
						Correctas: <span class="font-semibold text-emerald-600 dark:text-emerald-300"
							>{correctCount}</span
						>
					</p>
					<p class="rounded-lg bg-white px-2.5 py-2 dark:bg-slate-900/60">
						Timeouts: <span class="font-semibold text-amber-600 dark:text-amber-300"
							>{timeoutCount}</span
						>
					</p>
					<p class="rounded-lg bg-white px-2.5 py-2 dark:bg-slate-900/60">
						Incorrectas: <span class="font-semibold text-rose-600 dark:text-rose-300"
							>{questions.length - correctCount - timeoutCount}</span
						>
					</p>
				</div>

				{#if submitError}
					<div
						class="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
					>
						{submitError}
						<div class="mt-2">
							<button
								class="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
								onclick={retrySubmit}
								disabled={isSubmitting || submitted}
							>
								{isSubmitting ? 'Reintentando...' : 'Reintentar envio'}
							</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="mt-3 space-y-2">
				{#each questions as question, i}
					{@const result = computedResults[i]}
					<div
						class="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-800/40"
					>
						<div class="mb-2 flex items-start justify-between gap-2">
							<p class="font-semibold text-slate-800 dark:text-slate-100">
								{i + 1}.
								<span class="[&_p]:inline [&_.katex-display]:inline [&_.katex-display]:m-0">
									{@html renderInline(question.question)}
								</span>
							</p>
							{#if result.timedOut}
								<span
									class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
								>
									timeout
								</span>
							{:else if result.isCorrect}
								<span
									class="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
								>
									correcta
								</span>
							{:else}
								<span
									class="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
								>
									incorrecta
								</span>
							{/if}
						</div>

						<div class="space-y-1.5 text-slate-600 dark:text-slate-300">
							<p>
								Tu respuesta:
								<span class="font-medium text-slate-800 dark:text-slate-100">
									{#if result.selectedIndex >= 0}
										{String.fromCharCode(65 + result.selectedIndex)}.
										<span class="[&_p]:inline [&_.katex-display]:inline [&_.katex-display]:m-0">
											{@html renderInline(question.options[result.selectedIndex] ?? '')}
										</span>
									{:else}
										Sin respuesta
									{/if}
								</span>
							</p>
							<p>
								Correcta:
								<span class="font-medium text-slate-800 dark:text-slate-100">
									{String.fromCharCode(65 + result.correctIndex)}.
									<span class="[&_p]:inline [&_.katex-display]:inline [&_.katex-display]:m-0">
										{@html renderInline(question.options[result.correctIndex] ?? '')}
									</span>
								</span>
							</p>
							{#if question.explanation}
								<div
									class="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600 dark:bg-slate-900/50 dark:text-slate-300 [&_p]:m-0"
								>
									{@html renderBlock(question.explanation)}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
