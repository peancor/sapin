import { resolveDifficulty, type Difficulty } from './timed-quiz';

export type SustainedAttentionTestType = 'go_no_go';
export type SustainedAttentionTrialKind = 'go' | 'no-go';
export type SustainedAttentionPhase = 'practice' | 'main';

export interface SustainedAttentionTrial {
	id: string;
	phase: SustainedAttentionPhase;
	index: number;
	kind: SustainedAttentionTrialKind;
	stimulus: string;
	stimulusDurationMs: number;
	interStimulusMs: number;
}

export interface SustainedAttentionTrialResult {
	trialId: string;
	phase: SustainedAttentionPhase;
	kind: SustainedAttentionTrialKind;
	responded: boolean;
	reactionMs: number | null;
	outcome: 'hit' | 'commission' | 'omission' | 'correct-rejection';
}

export interface SustainedAttentionPayload {
	testType: SustainedAttentionTestType;
	difficulty: Difficulty;
	totalTrials: number;
	goTrials: number;
	noGoTrials: number;
	hits: number;
	commissionErrors: number;
	omissionErrors: number;
	meanReactionMs: number | null;
	score: number;
	completed: true;
}

export interface SustainedAttentionConfig {
	title: string;
	testType: SustainedAttentionTestType;
	difficulty: Difficulty;
	instructions: string;
	practiceTrials: SustainedAttentionTrial[];
	mainTrials: SustainedAttentionTrial[];
	goStimulus: string;
	noGoStimulus: string;
	stimulusDurationMs: number;
	interStimulusMs: number;
}

const DEFAULT_COPY =
	'Pulsa espacio o haz click solo cuando veas el estímulo objetivo. No respondas al estímulo de inhibición.';

const DIFFICULTY_DEFAULTS: Record<
	Difficulty,
	{ practiceTrials: number; mainTrials: number; stimulusDurationMs: number; interStimulusMs: number; noGoRate: number }
> = {
	easy: { practiceTrials: 6, mainTrials: 24, stimulusDurationMs: 1200, interStimulusMs: 700, noGoRate: 0.2 },
	medium: {
		practiceTrials: 8,
		mainTrials: 36,
		stimulusDurationMs: 900,
		interStimulusMs: 500,
		noGoRate: 0.25
	},
	hard: { practiceTrials: 10, mainTrials: 48, stimulusDurationMs: 700, interStimulusMs: 350, noGoRate: 0.3 }
};

function sanitizePositiveInteger(value: unknown, fallback: number, min = 1, max = 200): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	const rounded = Math.round(value);
	if (rounded < min) return min;
	if (rounded > max) return max;
	return rounded;
}

function shuffle<T>(items: T[]): T[] {
	const clone = [...items];
	for (let index = clone.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
	}
	return clone;
}

function buildTrials(params: {
	phase: SustainedAttentionPhase;
	count: number;
	goStimulus: string;
	noGoStimulus: string;
	stimulusDurationMs: number;
	interStimulusMs: number;
	noGoRate: number;
}): SustainedAttentionTrial[] {
	if (params.count <= 0) return [];

	const noGoCount =
		params.count <= 2 ? 1 : Math.max(1, Math.min(params.count - 1, Math.round(params.count * params.noGoRate)));
	const goCount = Math.max(1, params.count - noGoCount);
	const kinds = shuffle([
		...Array.from({ length: goCount }, () => 'go' as const),
		...Array.from({ length: noGoCount }, () => 'no-go' as const)
	]).slice(0, params.count);

	return kinds.map((kind, index) => ({
		id: `${params.phase}-${index + 1}-${kind}`,
		phase: params.phase,
		index,
		kind,
		stimulus: kind === 'go' ? params.goStimulus : params.noGoStimulus,
		stimulusDurationMs: params.stimulusDurationMs,
		interStimulusMs: params.interStimulusMs
	}));
}

export function resolveSustainedAttentionConfig(input: Record<string, unknown>): SustainedAttentionConfig {
	const difficulty = resolveDifficulty(input.difficulty);
	const defaults = DIFFICULTY_DEFAULTS[difficulty];
	const testType =
		input.testType === 'go_no_go' ? ('go_no_go' as const) : ('go_no_go' as const);
	const goStimulus =
		typeof input.goStimulus === 'string' && input.goStimulus.trim().length > 0
			? input.goStimulus.trim()
			: 'GO';
	const noGoStimulus =
		typeof input.noGoStimulus === 'string' && input.noGoStimulus.trim().length > 0
			? input.noGoStimulus.trim()
			: 'STOP';

	const practiceCount = sanitizePositiveInteger(input.practiceTrials, defaults.practiceTrials, 0, 40);
	const mainCount = sanitizePositiveInteger(input.mainTrials, defaults.mainTrials, 4, 200);

	return {
		title:
			typeof input.title === 'string' && input.title.trim().length > 0
				? input.title.trim()
				: 'Test de Atencion Sostenida',
		testType,
		difficulty,
		instructions:
			typeof input.instructions === 'string' && input.instructions.trim().length > 0
				? input.instructions.trim()
				: DEFAULT_COPY,
		practiceTrials: buildTrials({
			phase: 'practice',
			count: practiceCount,
			goStimulus,
			noGoStimulus,
			stimulusDurationMs: defaults.stimulusDurationMs,
			interStimulusMs: defaults.interStimulusMs,
			noGoRate: defaults.noGoRate
		}),
		mainTrials: buildTrials({
			phase: 'main',
			count: mainCount,
			goStimulus,
			noGoStimulus,
			stimulusDurationMs: defaults.stimulusDurationMs,
			interStimulusMs: defaults.interStimulusMs,
			noGoRate: defaults.noGoRate
		}),
		goStimulus,
		noGoStimulus,
		stimulusDurationMs: defaults.stimulusDurationMs,
		interStimulusMs: defaults.interStimulusMs
	};
}

export function buildSustainedAttentionPayload(params: {
	testType: SustainedAttentionTestType;
	difficulty: Difficulty;
	results: SustainedAttentionTrialResult[];
}): SustainedAttentionPayload {
	const mainResults = params.results.filter((result) => result.phase === 'main');
	const totalTrials = mainResults.length;
	const goTrials = mainResults.filter((result) => result.kind === 'go').length;
	const noGoTrials = mainResults.filter((result) => result.kind === 'no-go').length;
	const hits = mainResults.filter((result) => result.outcome === 'hit').length;
	const commissionErrors = mainResults.filter((result) => result.outcome === 'commission').length;
	const omissionErrors = mainResults.filter((result) => result.outcome === 'omission').length;
	const successfulReactions = mainResults.filter(
		(result) => result.outcome === 'hit' && typeof result.reactionMs === 'number'
	);
	const meanReactionMs =
		successfulReactions.length > 0
			? Math.round(
					successfulReactions.reduce((sum, result) => sum + (result.reactionMs ?? 0), 0) /
						successfulReactions.length
				)
			: null;
	const correctRejections = mainResults.filter(
		(result) => result.outcome === 'correct-rejection'
	).length;
	const score = totalTrials > 0 ? (hits + correctRejections) / totalTrials : 0;

	return {
		testType: params.testType,
		difficulty: params.difficulty,
		totalTrials,
		goTrials,
		noGoTrials,
		hits,
		commissionErrors,
		omissionErrors,
		meanReactionMs,
		score,
		completed: true
	};
}

export function buildTrialResult(params: {
	trial: SustainedAttentionTrial;
	responded: boolean;
	reactionMs: number | null;
}): SustainedAttentionTrialResult {
	let outcome: SustainedAttentionTrialResult['outcome'];

	if (params.trial.kind === 'go') {
		outcome = params.responded ? 'hit' : 'omission';
	} else {
		outcome = params.responded ? 'commission' : 'correct-rejection';
	}

	return {
		trialId: params.trial.id,
		phase: params.trial.phase,
		kind: params.trial.kind,
		responded: params.responded,
		reactionMs: params.responded ? params.reactionMs : null,
		outcome
	};
}
