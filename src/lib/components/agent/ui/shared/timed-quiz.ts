export type Difficulty = 'easy' | 'medium' | 'hard';
export type FeedbackState = 'correct' | 'incorrect' | 'timeout' | null;

export interface TimedQuizQuestion {
	question: string;
	options: string[];
	correctIndex: number;
	explanation?: string;
}

export interface TimedQuizQuestionResult {
	selectedIndex: number;
	correctIndex: number;
	isCorrect: boolean;
	timedOut: boolean;
	responseMs: number | null;
}

export interface TimedQuizPayload {
	answers: number[];
	difficulty: Difficulty;
	timePerQuestionSec: number;
	questionResults: TimedQuizQuestionResult[];
	correctCount: number;
	timeoutCount: number;
	score: number;
	completed: true;
}

export interface TimerByDifficultySec {
	easy?: number;
	medium?: number;
	hard?: number;
}

export interface ResolvedTimedQuizConfig {
	resolvedDifficulty: Difficulty;
	resolvedTimers: Record<Difficulty, number>;
	timePerQuestionSec: number;
	autoAdvanceMs: number;
}

export const DEFAULT_TIMERS: Record<Difficulty, number> = {
	easy: 30,
	medium: 20,
	hard: 12
};

export const MIN_TIMER_SEC = 3;
export const MAX_TIMER_SEC = 300;
export const MIN_AUTO_ADVANCE_MS = 150;
export const MAX_AUTO_ADVANCE_MS = 4000;

export function resolveDifficulty(value: unknown): Difficulty {
	if (value === 'easy' || value === 'medium' || value === 'hard') return value;
	return 'medium';
}

export function sanitizeTimerSeconds(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	const rounded = Math.round(value);
	if (rounded < MIN_TIMER_SEC) return MIN_TIMER_SEC;
	if (rounded > MAX_TIMER_SEC) return MAX_TIMER_SEC;
	return rounded;
}

export function sanitizeAutoAdvanceMs(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return 700;
	const rounded = Math.round(value);
	if (rounded < MIN_AUTO_ADVANCE_MS) return MIN_AUTO_ADVANCE_MS;
	if (rounded > MAX_AUTO_ADVANCE_MS) return MAX_AUTO_ADVANCE_MS;
	return rounded;
}

export function resolveTimedQuizConfig(params: {
	difficulty?: unknown;
	timerByDifficultySec?: TimerByDifficultySec;
	autoAdvanceDelayMs?: unknown;
}): ResolvedTimedQuizConfig {
	const resolvedDifficulty = resolveDifficulty(params.difficulty);
	const resolvedTimers = {
		easy: sanitizeTimerSeconds(params.timerByDifficultySec?.easy, DEFAULT_TIMERS.easy),
		medium: sanitizeTimerSeconds(params.timerByDifficultySec?.medium, DEFAULT_TIMERS.medium),
		hard: sanitizeTimerSeconds(params.timerByDifficultySec?.hard, DEFAULT_TIMERS.hard)
	} satisfies Record<Difficulty, number>;

	return {
		resolvedDifficulty,
		resolvedTimers,
		timePerQuestionSec: resolvedTimers[resolvedDifficulty],
		autoAdvanceMs: sanitizeAutoAdvanceMs(params.autoAdvanceDelayMs)
	};
}

export function buildTimedQuizQuestionResult(
	question: TimedQuizQuestion,
	selectedIndex: number,
	params: { timedOut?: boolean; responseMs?: number | null } = {}
): TimedQuizQuestionResult {
	const safeSelected =
		selectedIndex < -1 || selectedIndex >= question.options.length ? -1 : selectedIndex;

	return {
		selectedIndex: safeSelected,
		correctIndex: question.correctIndex,
		isCorrect: safeSelected === question.correctIndex,
		timedOut: params.timedOut === true || safeSelected < 0,
		responseMs: params.responseMs ?? null
	};
}

export function parseInitialTimedQuizPayload(
	value: Record<string, unknown> | undefined,
	questions: TimedQuizQuestion[],
	fallbackDifficulty: Difficulty,
	fallbackTimePerQuestionSec: number
): TimedQuizPayload | null {
	if (!value) return null;

	const rawAnswers = Array.isArray(value.answers) ? value.answers : [];
	const normalizedAnswers = questions.map((question, index) => {
		const raw = rawAnswers[index];
		if (typeof raw !== 'number' || !Number.isFinite(raw)) return -1;
		const rounded = Math.round(raw);
		if (rounded < -1 || rounded >= question.options.length) return -1;
		return rounded;
	});

	const rawResults = Array.isArray(value.questionResults) ? value.questionResults : [];
	const normalizedResults = questions.map((question, index) => {
		const raw = rawResults[index];
		if (!raw || typeof raw !== 'object') {
			return buildTimedQuizQuestionResult(question, normalizedAnswers[index], {
				timedOut: normalizedAnswers[index] < 0
			});
		}

		const record = raw as Record<string, unknown>;
		const selectedRaw = record.selectedIndex;
		const selectedIndex =
			typeof selectedRaw === 'number' && Number.isFinite(selectedRaw)
				? Math.round(selectedRaw)
				: normalizedAnswers[index];
		const responseRaw = record.responseMs;
		const responseMs =
			typeof responseRaw === 'number' && Number.isFinite(responseRaw) && responseRaw >= 0
				? Math.round(responseRaw)
				: null;

		return buildTimedQuizQuestionResult(question, selectedIndex, {
			timedOut: record.timedOut === true,
			responseMs
		});
	});

	return buildTimedQuizPayload({
		questions,
		answers: normalizedAnswers,
		questionResults: normalizedResults,
		difficulty: resolveDifficulty(value.difficulty) ?? fallbackDifficulty,
		timePerQuestionSec:
			typeof value.timePerQuestionSec === 'number' && Number.isFinite(value.timePerQuestionSec)
				? sanitizeTimerSeconds(value.timePerQuestionSec, fallbackTimePerQuestionSec)
				: fallbackTimePerQuestionSec
	});
}

export function buildTimedQuizPayload(params: {
	questions: TimedQuizQuestion[];
	answers: number[];
	questionResults: Array<TimedQuizQuestionResult | null>;
	difficulty: Difficulty;
	timePerQuestionSec: number;
}): TimedQuizPayload {
	const finalizedResults = params.questions.map((question, index) => {
		const stored = params.questionResults[index];
		if (stored) return stored;

		return buildTimedQuizQuestionResult(question, params.answers[index] ?? -1);
	});

	const correctCount = finalizedResults.filter((result) => result.isCorrect).length;
	const timeoutCount = finalizedResults.filter((result) => result.timedOut).length;
	const score = params.questions.length > 0 ? correctCount / params.questions.length : 0;

	return {
		answers: finalizedResults.map((result) => result.selectedIndex),
		difficulty: params.difficulty,
		timePerQuestionSec: params.timePerQuestionSec,
		questionResults: finalizedResults,
		correctCount,
		timeoutCount,
		score,
		completed: true
	};
}

export function getTimedQuizScoreBadgeClass(percent: number): string {
	if (percent >= 80)
		return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
	if (percent >= 60)
		return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
	return 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300';
}
