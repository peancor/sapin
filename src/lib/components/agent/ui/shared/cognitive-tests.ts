import type { Difficulty } from './timed-quiz';

export type CognitivePhase = 'practice' | 'main';
export type ImmersiveCognitivePhase = 'intro' | 'practice' | 'practice-complete' | 'main' | 'results';

export interface ImmersiveState {
	canCloseSafely: boolean;
	closePrompt?: string;
}

export function sanitizePositiveInteger(
	value: unknown,
	fallback: number,
	min = 1,
	max = 200
): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	const rounded = Math.round(value);
	if (rounded < min) return min;
	if (rounded > max) return max;
	return rounded;
}

export function sanitizeChoice<T extends string>(
	value: unknown,
	choices: readonly T[],
	fallback: T
): T {
	return typeof value === 'string' && choices.includes(value as T) ? (value as T) : fallback;
}

export function meanRounded(values: Array<number | null | undefined>): number | null {
	const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
	if (valid.length === 0) return null;
	return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

export function scoreRatio(correct: number, total: number): number {
	if (total <= 0) return 0;
	return Math.max(0, Math.min(1, correct / total));
}

export function formatDifficultyLabel(value: Difficulty): string {
	if (value === 'easy') return 'Facil';
	if (value === 'hard') return 'Dificil';
	return 'Media';
}

export function formatPercent(score: number): string {
	return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}
