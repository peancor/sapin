import { resolveDifficulty, type Difficulty } from './timed-quiz';
import {
	meanRounded,
	sanitizeChoice,
	sanitizePositiveInteger,
	scoreRatio,
	type CognitivePhase
} from './cognitive-tests';

export type AttentionControlTestType = 'go_no_go' | 'stroop' | 'flanker' | 'sdmt';
export type StroopColor = 'rojo' | 'azul' | 'verde' | 'amarillo';
export type FlankerDirection = 'left' | 'right';
export type AttentionControlResponse =
	| 'respond'
	| StroopColor
	| FlankerDirection
	| null;

export interface AttentionControlTrial {
	id: string;
	phase: CognitivePhase;
	index: number;
	testType: AttentionControlTestType;
	stimulusDurationMs: number;
	interStimulusMs: number;
	stimulus:
		| {
				kind: 'go_no_go';
				label: string;
				tone: 'go' | 'no-go';
		  }
		| {
				kind: 'stroop';
				word: string;
				inkColor: StroopColor;
				isCongruent: boolean;
				options: StroopColor[];
		  }
		| {
				kind: 'flanker';
				pattern: string;
				targetDirection: FlankerDirection;
				isCongruent: boolean;
		  };
	expectedResponse: AttentionControlResponse;
}

export interface AttentionControlTrialLog {
	trialId: string;
	phase: CognitivePhase;
	index: number;
	testType: AttentionControlTestType;
	stimulus: string;
	expectedResponse: AttentionControlResponse;
	actualResponse: AttentionControlResponse;
	reactionMs: number | null;
	outcome:
		| 'hit'
		| 'commission'
		| 'omission'
		| 'correct-rejection'
		| 'correct'
		| 'error'
		| 'timeout';
	stimulusStartedAtMs: number;
	stimulusEndedAtMs: number;
	isCongruent?: boolean;
	word?: string;
	inkColor?: StroopColor;
	pattern?: string;
	targetDirection?: FlankerDirection;
}

export interface AttentionControlSummary {
	testType: AttentionControlTestType;
	totalTrials: number;
	correctCount: number;
	errorCount: number;
	accuracy: number;
	meanReactionMs: number | null;
	goTrials?: number;
	noGoTrials?: number;
	hits?: number;
	commissionErrors?: number;
	omissionErrors?: number;
	correctRejections?: number;
	congruentTrials?: number;
	incongruentTrials?: number;
	congruentMeanReactionMs?: number | null;
	incongruentMeanReactionMs?: number | null;
	interferenceCost?: number | null;
	conflictCost?: number | null;
}

export interface AttentionControlPayload {
	testType: AttentionControlTestType;
	difficulty: Difficulty;
	summary: AttentionControlSummary;
	trialLog: AttentionControlTrialLog[];
	score: number;
	completed: true;
}

export interface AttentionControlConfig {
	title: string;
	testType: AttentionControlTestType;
	difficulty: Difficulty;
	instructions: string;
	practiceTrials: AttentionControlTrial[];
	mainTrials: AttentionControlTrial[];
	goStimulus: string;
	noGoStimulus: string;
	responseMode: 'single' | 'palette' | 'binary';
}

const STROOP_COLORS = ['rojo', 'azul', 'verde', 'amarillo'] as const satisfies readonly StroopColor[];

const ATTENTION_DEFAULTS: Record<
	Exclude<AttentionControlTestType, 'sdmt'>,
	Record<
		Difficulty,
		{ practiceTrials: number; mainTrials: number; stimulusDurationMs: number; interStimulusMs: number }
	>
> = {
	go_no_go: {
		easy: { practiceTrials: 6, mainTrials: 24, stimulusDurationMs: 1200, interStimulusMs: 800 },
		medium: { practiceTrials: 8, mainTrials: 36, stimulusDurationMs: 900, interStimulusMs: 520 },
		hard: { practiceTrials: 10, mainTrials: 48, stimulusDurationMs: 700, interStimulusMs: 360 }
	},
	stroop: {
		easy: { practiceTrials: 6, mainTrials: 24, stimulusDurationMs: 2200, interStimulusMs: 700 },
		medium: { practiceTrials: 8, mainTrials: 36, stimulusDurationMs: 1800, interStimulusMs: 520 },
		hard: { practiceTrials: 10, mainTrials: 48, stimulusDurationMs: 1400, interStimulusMs: 360 }
	},
	flanker: {
		easy: { practiceTrials: 6, mainTrials: 24, stimulusDurationMs: 1800, interStimulusMs: 700 },
		medium: { practiceTrials: 8, mainTrials: 36, stimulusDurationMs: 1400, interStimulusMs: 520 },
		hard: { practiceTrials: 10, mainTrials: 48, stimulusDurationMs: 1100, interStimulusMs: 360 }
	}
};

const DEFAULT_INSTRUCTIONS: Record<Exclude<AttentionControlTestType, 'sdmt'>, string> = {
	go_no_go:
		'Pulsa espacio o toca el boton solo cuando aparezca el estimulo objetivo. No respondas al estimulo de inhibicion.',
	stroop:
		'Indica el color de la tinta, no la palabra escrita. Responde lo mas rapido posible sin sacrificar precision.',
	flanker:
		'Indica la direccion de la flecha central. Ignora las flechas laterales y responde con rapidez.'
};

function buildEvenlySpacedIndices(count: number, markedCount: number): Set<number> {
	if (count <= 0 || markedCount <= 0) return new Set<number>();
	const indices = new Set<number>();
	const step = count / markedCount;
	for (let item = 0; item < markedCount; item += 1) {
		const target = Math.min(count - 1, Math.max(0, Math.round((item + 1) * step) - 1));
		indices.add(target);
	}
	return indices;
}

function buildGoNoGoTrials(params: {
	phase: CognitivePhase;
	count: number;
	goStimulus: string;
	noGoStimulus: string;
	stimulusDurationMs: number;
	interStimulusMs: number;
}): AttentionControlTrial[] {
	if (params.count <= 0) return [];
	const noGoCount = Math.max(1, Math.round(params.count * 0.25));
	const noGoIndices = buildEvenlySpacedIndices(params.count, noGoCount);
	return Array.from({ length: params.count }, (_, index) => {
		const isNoGo = noGoIndices.has(index);
		return {
			id: `${params.phase}-${index + 1}-${isNoGo ? 'no-go' : 'go'}`,
			phase: params.phase,
			index,
			testType: 'go_no_go',
			stimulusDurationMs: params.stimulusDurationMs,
			interStimulusMs: params.interStimulusMs,
			stimulus: {
				kind: 'go_no_go',
				label: isNoGo ? params.noGoStimulus : params.goStimulus,
				tone: isNoGo ? 'no-go' : 'go'
			},
			expectedResponse: isNoGo ? null : 'respond'
		};
	});
}

function buildStroopTrials(params: {
	phase: CognitivePhase;
	count: number;
	stimulusDurationMs: number;
	interStimulusMs: number;
}): AttentionControlTrial[] {
	return Array.from({ length: params.count }, (_, index) => {
		const inkColor = STROOP_COLORS[index % STROOP_COLORS.length];
		const isCongruent = index % 2 === 0;
		const word = isCongruent
			? inkColor
			: STROOP_COLORS[(index + 1) % STROOP_COLORS.length];
		return {
			id: `${params.phase}-${index + 1}-${isCongruent ? 'congruent' : 'incongruent'}`,
			phase: params.phase,
			index,
			testType: 'stroop',
			stimulusDurationMs: params.stimulusDurationMs,
			interStimulusMs: params.interStimulusMs,
			stimulus: {
				kind: 'stroop',
				word,
				inkColor,
				isCongruent,
				options: [...STROOP_COLORS]
			},
			expectedResponse: inkColor
		};
	});
}

function buildFlankerPattern(
	targetDirection: FlankerDirection,
	isCongruent: boolean
): string {
	if (targetDirection === 'left') {
		return isCongruent ? '<<<<<' : '>><>>';
	}
	return isCongruent ? '>>>>>' : '<<><<';
}

function buildFlankerTrials(params: {
	phase: CognitivePhase;
	count: number;
	stimulusDurationMs: number;
	interStimulusMs: number;
}): AttentionControlTrial[] {
	return Array.from({ length: params.count }, (_, index) => {
		const isCongruent = index % 2 === 0;
		const targetDirection: FlankerDirection = index % 4 < 2 ? 'left' : 'right';
		return {
			id: `${params.phase}-${index + 1}-${isCongruent ? 'congruent' : 'incongruent'}`,
			phase: params.phase,
			index,
			testType: 'flanker',
			stimulusDurationMs: params.stimulusDurationMs,
			interStimulusMs: params.interStimulusMs,
			stimulus: {
				kind: 'flanker',
				pattern: buildFlankerPattern(targetDirection, isCongruent),
				targetDirection,
				isCongruent
			},
			expectedResponse: targetDirection
		};
	});
}

export function resolveAttentionControlConfig(
	input: Record<string, unknown>
): AttentionControlConfig {
	const difficulty = resolveDifficulty(input.difficulty);
	const testType = sanitizeChoice(input.testType, ['go_no_go', 'stroop', 'flanker', 'sdmt'], 'stroop');
	if (testType === 'sdmt') {
		return {
			title:
				typeof input.title === 'string' && input.title.trim().length > 0
					? input.title.trim()
					: 'Attention Control Test',
			testType,
			difficulty,
			instructions:
				typeof input.instructions === 'string' && input.instructions.trim().length > 0
					? input.instructions.trim()
					: 'La variante SDMT queda preparada para una siguiente iteracion.',
			practiceTrials: [],
			mainTrials: [],
			goStimulus: 'GO',
			noGoStimulus: 'STOP',
			responseMode: 'palette'
		};
	}

	const defaults = ATTENTION_DEFAULTS[testType][difficulty];
	const practiceCount = sanitizePositiveInteger(input.practiceTrials, defaults.practiceTrials, 0, 40);
	const mainCount = sanitizePositiveInteger(input.mainTrials, defaults.mainTrials, 4, 200);
	const goStimulus =
		typeof input.goStimulus === 'string' && input.goStimulus.trim().length > 0
			? input.goStimulus.trim()
			: 'GO';
	const noGoStimulus =
		typeof input.noGoStimulus === 'string' && input.noGoStimulus.trim().length > 0
			? input.noGoStimulus.trim()
			: 'STOP';

	const buildTrials = (phase: CognitivePhase, count: number): AttentionControlTrial[] => {
		if (testType === 'go_no_go') {
			return buildGoNoGoTrials({
				phase,
				count,
				goStimulus,
				noGoStimulus,
				stimulusDurationMs: defaults.stimulusDurationMs,
				interStimulusMs: defaults.interStimulusMs
			});
		}

		if (testType === 'stroop') {
			return buildStroopTrials({
				phase,
				count,
				stimulusDurationMs: defaults.stimulusDurationMs,
				interStimulusMs: defaults.interStimulusMs
			});
		}

		return buildFlankerTrials({
			phase,
			count,
			stimulusDurationMs: defaults.stimulusDurationMs,
			interStimulusMs: defaults.interStimulusMs
		});
	};

	return {
		title:
			typeof input.title === 'string' && input.title.trim().length > 0
				? input.title.trim()
				: testType === 'go_no_go'
					? 'Go/No-Go Task'
					: testType === 'stroop'
						? 'Stroop Task'
						: 'Flanker Task',
		testType,
		difficulty,
		instructions:
			typeof input.instructions === 'string' && input.instructions.trim().length > 0
				? input.instructions.trim()
				: DEFAULT_INSTRUCTIONS[testType],
		practiceTrials: buildTrials('practice', practiceCount),
		mainTrials: buildTrials('main', mainCount),
		goStimulus,
		noGoStimulus,
		responseMode:
			testType === 'go_no_go' ? 'single' : testType === 'stroop' ? 'palette' : 'binary'
	};
}

export function buildAttentionControlTrialLog(params: {
	trial: AttentionControlTrial;
	actualResponse: AttentionControlResponse;
	reactionMs: number | null;
	stimulusStartedAtMs: number;
	stimulusEndedAtMs: number;
}): AttentionControlTrialLog {
	let outcome: AttentionControlTrialLog['outcome'];
	if (params.trial.testType === 'go_no_go') {
		const isGoTrial = params.trial.stimulus.kind === 'go_no_go' && params.trial.stimulus.tone === 'go';
		if (isGoTrial) {
			outcome = params.actualResponse === 'respond' ? 'hit' : 'omission';
		} else {
			outcome = params.actualResponse === 'respond' ? 'commission' : 'correct-rejection';
		}
	} else if (params.actualResponse === null) {
		outcome = 'timeout';
	} else {
		outcome = params.actualResponse === params.trial.expectedResponse ? 'correct' : 'error';
	}

	const base: AttentionControlTrialLog = {
		trialId: params.trial.id,
		phase: params.trial.phase,
		index: params.trial.index,
		testType: params.trial.testType,
		stimulus: stringifyStimulus(params.trial),
		expectedResponse: params.trial.expectedResponse,
		actualResponse: params.actualResponse,
		reactionMs: params.actualResponse !== null ? params.reactionMs : null,
		outcome,
		stimulusStartedAtMs: params.stimulusStartedAtMs,
		stimulusEndedAtMs: params.stimulusEndedAtMs
	};

	if (params.trial.stimulus.kind === 'stroop') {
		return {
			...base,
			isCongruent: params.trial.stimulus.isCongruent,
			word: params.trial.stimulus.word,
			inkColor: params.trial.stimulus.inkColor
		};
	}

	if (params.trial.stimulus.kind === 'flanker') {
		return {
			...base,
			isCongruent: params.trial.stimulus.isCongruent,
			pattern: params.trial.stimulus.pattern,
			targetDirection: params.trial.stimulus.targetDirection
		};
	}

	return base;
}

function buildGoNoGoSummary(logs: AttentionControlTrialLog[]): AttentionControlSummary {
	const hits = logs.filter((entry) => entry.outcome === 'hit').length;
	const commissionErrors = logs.filter((entry) => entry.outcome === 'commission').length;
	const omissionErrors = logs.filter((entry) => entry.outcome === 'omission').length;
	const correctRejections = logs.filter((entry) => entry.outcome === 'correct-rejection').length;
	const goTrials = logs.filter((entry) => entry.expectedResponse === 'respond').length;
	const noGoTrials = logs.filter((entry) => entry.expectedResponse === null).length;
	const totalTrials = logs.length;
	const correctCount = hits + correctRejections;
	return {
		testType: 'go_no_go',
		totalTrials,
		correctCount,
		errorCount: commissionErrors + omissionErrors,
		accuracy: scoreRatio(correctCount, totalTrials),
		meanReactionMs: meanRounded(
			logs
				.filter((entry) => entry.outcome === 'hit')
				.map((entry) => entry.reactionMs)
		),
		goTrials,
		noGoTrials,
		hits,
		commissionErrors,
		omissionErrors,
		correctRejections
	};
}

function buildCongruencySummary(
	testType: 'stroop' | 'flanker',
	logs: AttentionControlTrialLog[]
): AttentionControlSummary {
	const congruent = logs.filter((entry) => entry.isCongruent === true);
	const incongruent = logs.filter((entry) => entry.isCongruent === false);
	const correctCount = logs.filter((entry) => entry.outcome === 'correct').length;
	const errorCount = logs.filter((entry) => entry.outcome === 'error' || entry.outcome === 'timeout').length;
	const congruentMeanReactionMs = meanRounded(
		congruent.filter((entry) => entry.outcome === 'correct').map((entry) => entry.reactionMs)
	);
	const incongruentMeanReactionMs = meanRounded(
		incongruent.filter((entry) => entry.outcome === 'correct').map((entry) => entry.reactionMs)
	);
	const cost =
		typeof congruentMeanReactionMs === 'number' && typeof incongruentMeanReactionMs === 'number'
			? incongruentMeanReactionMs - congruentMeanReactionMs
			: null;

	return {
		testType,
		totalTrials: logs.length,
		correctCount,
		errorCount,
		accuracy: scoreRatio(correctCount, logs.length),
		meanReactionMs: meanRounded(
			logs.filter((entry) => entry.outcome === 'correct').map((entry) => entry.reactionMs)
		),
		congruentTrials: congruent.length,
		incongruentTrials: incongruent.length,
		congruentMeanReactionMs,
		incongruentMeanReactionMs,
		interferenceCost: testType === 'stroop' ? cost : undefined,
		conflictCost: testType === 'flanker' ? cost : undefined
	};
}

export function buildAttentionControlPayload(params: {
	testType: AttentionControlTestType;
	difficulty: Difficulty;
	trialLog: AttentionControlTrialLog[];
}): AttentionControlPayload {
	const mainLogs = params.trialLog.filter((entry) => entry.phase === 'main');
	const summary =
		params.testType === 'go_no_go'
			? buildGoNoGoSummary(mainLogs)
			: params.testType === 'stroop'
				? buildCongruencySummary('stroop', mainLogs)
				: params.testType === 'flanker'
					? buildCongruencySummary('flanker', mainLogs)
					: {
							testType: 'sdmt' as const,
							totalTrials: 0,
							correctCount: 0,
							errorCount: 0,
							accuracy: 0,
							meanReactionMs: null
						};

	return {
		testType: params.testType,
		difficulty: params.difficulty,
		summary,
		trialLog: params.trialLog,
		score: summary.accuracy,
		completed: true
	};
}

export function parseInitialAttentionControlPayload(
	value: Record<string, unknown> | undefined
): AttentionControlPayload | null {
	if (!value || value.completed !== true) return null;
	if (!value.summary || typeof value.summary !== 'object') return null;
	if (!Array.isArray(value.trialLog)) return null;
	return value as unknown as AttentionControlPayload;
}

export function stringifyStimulus(trial: AttentionControlTrial): string {
	if (trial.stimulus.kind === 'go_no_go') return trial.stimulus.label;
	if (trial.stimulus.kind === 'stroop') return `${trial.stimulus.word}/${trial.stimulus.inkColor}`;
	return trial.stimulus.pattern;
}
