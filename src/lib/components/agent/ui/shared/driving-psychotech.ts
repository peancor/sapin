import { resolveDifficulty, type Difficulty } from './timed-quiz';
import {
	meanRounded,
	sanitizeChoice,
	sanitizePositiveInteger,
	scoreRatio,
	type CognitivePhase
} from './cognitive-tests';

export type DrivingPsychotechTestType =
	| 'bimanual_coordination'
	| 'time_to_contact'
	| 'multiple_reaction_braking';
export type ReactionResponseMode = 'brake_only' | 'selective';
export type ReactionResponse = 'brake' | 'left' | 'right' | null;
export type ReactionStimulusKind = 'hazard' | 'distractor';

export interface BimanualSegmentLog {
	phase: CognitivePhase;
	tMs: number;
	leftOffsetNorm: number;
	rightOffsetNorm: number;
	leftOnTrack: boolean;
	rightOnTrack: boolean;
	leftCenterNorm: number;
	rightCenterNorm: number;
}

export interface TimeToContactTrial {
	id: string;
	phase: CognitivePhase;
	index: number;
	speedNorm: number;
	visibleDurationMs: number;
	occlusionMs: number;
	postExitWindowMs: number;
	distractors: boolean;
}

export interface TimeToContactTrialLog {
	trialId: string;
	phase: CognitivePhase;
	index: number;
	speedNorm: number;
	occlusionMs: number;
	predictedExitAtMs: number;
	responseAtMs: number | null;
	errorMs: number | null;
	absErrorMs: number | null;
	outcome: 'on_time' | 'early' | 'late' | 'miss';
}

export interface ReactionBrakingTrial {
	id: string;
	phase: CognitivePhase;
	index: number;
	stimulusKind: ReactionStimulusKind;
	stimulusSide: 'left' | 'right' | 'center';
	responseMode: ReactionResponseMode;
	preStimulusMs: number;
	responseWindowMs: number;
}

export interface ReactionBrakingTrialLog {
	trialId: string;
	phase: CognitivePhase;
	index: number;
	stimulusKind: ReactionStimulusKind;
	stimulusSide: 'left' | 'right' | 'center';
	expectedResponse: ReactionResponse;
	actualResponse: ReactionResponse;
	reactionMs: number | null;
	outcome: 'hit' | 'miss' | 'false_alarm' | 'wrong_side' | 'correct_rejection';
}

export interface BimanualSummary {
	totalDurationMs: number;
	percentOnTrackLeft: number;
	percentOnTrackRight: number;
	simultaneousOffTrackMs: number;
	offTrackEventsLeft: number;
	offTrackEventsRight: number;
	meanAbsoluteOffsetLeft: number;
	meanAbsoluteOffsetRight: number;
	score: number;
}

export interface TimeToContactSummary {
	meanAbsoluteErrorMs: number | null;
	signedMeanErrorMs: number | null;
	onTimeCount: number;
	earlyCount: number;
	lateCount: number;
	missCount: number;
	score: number;
}

export interface ReactionBrakingSummary {
	hits: number;
	misses: number;
	falseAlarms: number;
	wrongSide: number;
	correctRejections: number;
	meanReactionMs: number | null;
	score: number;
}

export type DrivingPsychotechPayload =
	| {
			testType: 'bimanual_coordination';
			difficulty: Difficulty;
			summary: BimanualSummary;
			segmentLog: BimanualSegmentLog[];
			score: number;
			completed: true;
	  }
	| {
			testType: 'time_to_contact';
			difficulty: Difficulty;
			summary: TimeToContactSummary;
			trialLog: TimeToContactTrialLog[];
			score: number;
			completed: true;
	  }
	| {
			testType: 'multiple_reaction_braking';
			difficulty: Difficulty;
			summary: ReactionBrakingSummary;
			trialLog: ReactionBrakingTrialLog[];
			score: number;
			completed: true;
	  };

export interface DrivingPsychotechCommonConfig {
	title: string;
	testType: DrivingPsychotechTestType;
	difficulty: Difficulty;
	instructions: string;
}

export interface BimanualConfig extends DrivingPsychotechCommonConfig {
	testType: 'bimanual_coordination';
	practiceDurationSec: number;
	durationSec: number;
	sampleMs: number;
	trackHalfWidth: number;
	scrollSpeed: number;
	inputSpeed: number;
	curveAmplitudeLeft: number;
	curveAmplitudeRight: number;
	portraitPreferred: true;
}

export interface TimeToContactConfig extends DrivingPsychotechCommonConfig {
	testType: 'time_to_contact';
	practiceTrials: TimeToContactTrial[];
	mainTrials: TimeToContactTrial[];
	onTimeThresholdMs: number;
}

export interface ReactionBrakingConfig extends DrivingPsychotechCommonConfig {
	testType: 'multiple_reaction_braking';
	practiceTrials: ReactionBrakingTrial[];
	mainTrials: ReactionBrakingTrial[];
	responseMode: ReactionResponseMode;
}

export type DrivingPsychotechConfig =
	| BimanualConfig
	| TimeToContactConfig
	| ReactionBrakingConfig;

export interface BimanualSummaryInput {
	totalDurationMs: number;
	onTrackLeftMs: number;
	onTrackRightMs: number;
	simultaneousOffTrackMs: number;
	offTrackEventsLeft: number;
	offTrackEventsRight: number;
	meanAbsoluteOffsetLeft: number;
	meanAbsoluteOffsetRight: number;
}

const DEFAULT_INSTRUCTIONS: Record<DrivingPsychotechTestType, string> = {
	bimanual_coordination:
		'Mantén ambos cursores dentro de sus pistas al mismo tiempo. Usa dos dedos en móvil o A/D y J/L en desktop.',
	time_to_contact:
		'Observa el objeto entrar en la zona oculta y responde justo cuando creas que reaparecería al otro lado.',
	multiple_reaction_braking:
		'Responde solo ante estímulos de peligro. En fácil y medio frena; en difícil distingue izquierda y derecha.'
};

const BIMANUAL_DEFAULTS: Record<
	Difficulty,
	{
		practiceDurationSec: number;
		durationSec: number;
		trackHalfWidth: number;
		scrollSpeed: number;
		inputSpeed: number;
		curveAmplitudeLeft: number;
		curveAmplitudeRight: number;
	}
> = {
	easy: {
		practiceDurationSec: 10,
		durationSec: 30,
		trackHalfWidth: 0.1,
		scrollSpeed: 0.9,
		inputSpeed: 0.55,
		curveAmplitudeLeft: 0.06,
		curveAmplitudeRight: 0.05
	},
	medium: {
		practiceDurationSec: 12,
		durationSec: 36,
		trackHalfWidth: 0.085,
		scrollSpeed: 1.12,
		inputSpeed: 0.65,
		curveAmplitudeLeft: 0.075,
		curveAmplitudeRight: 0.07
	},
	hard: {
		practiceDurationSec: 14,
		durationSec: 42,
		trackHalfWidth: 0.07,
		scrollSpeed: 1.34,
		inputSpeed: 0.78,
		curveAmplitudeLeft: 0.1,
		curveAmplitudeRight: 0.095
	}
};

const TTC_DEFAULTS: Record<
	Difficulty,
	{
		practiceTrials: number;
		mainTrials: number;
		baseVisibleMs: number;
		baseOcclusionMs: number;
		onTimeThresholdMs: number;
	}
> = {
	easy: { practiceTrials: 4, mainTrials: 10, baseVisibleMs: 1200, baseOcclusionMs: 900, onTimeThresholdMs: 180 },
	medium: { practiceTrials: 5, mainTrials: 12, baseVisibleMs: 1100, baseOcclusionMs: 1050, onTimeThresholdMs: 140 },
	hard: { practiceTrials: 6, mainTrials: 14, baseVisibleMs: 1000, baseOcclusionMs: 1200, onTimeThresholdMs: 110 }
};

const REACTION_DEFAULTS: Record<
	Difficulty,
	{
		practiceTrials: number;
		mainTrials: number;
		preStimulusMs: number;
		responseWindowMs: number;
		responseMode: ReactionResponseMode;
	}
> = {
	easy: {
		practiceTrials: 5,
		mainTrials: 12,
		preStimulusMs: 950,
		responseWindowMs: 1100,
		responseMode: 'brake_only'
	},
	medium: {
		practiceTrials: 6,
		mainTrials: 16,
		preStimulusMs: 820,
		responseWindowMs: 950,
		responseMode: 'brake_only'
	},
	hard: {
		practiceTrials: 6,
		mainTrials: 18,
		preStimulusMs: 720,
		responseWindowMs: 850,
		responseMode: 'selective'
	}
};

function clampNorm(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function buildTimeToContactTrials(params: {
	phase: CognitivePhase;
	count: number;
	baseVisibleMs: number;
	baseOcclusionMs: number;
	difficulty: Difficulty;
}): TimeToContactTrial[] {
	return Array.from({ length: params.count }, (_, index) => {
		const speedNorm = clampNorm(0.56 + (index % 5) * 0.08 + (params.difficulty === 'hard' ? 0.08 : 0), 0.45, 1);
		const occlusionMs = Math.round(
			params.baseOcclusionMs + ((index % 4) - 1.5) * (params.difficulty === 'easy' ? 80 : 110)
		);
		return {
			id: `${params.phase}-${index + 1}`,
			phase: params.phase,
			index,
			speedNorm,
			visibleDurationMs: params.baseVisibleMs,
			occlusionMs: Math.max(500, occlusionMs),
			postExitWindowMs: params.difficulty === 'easy' ? 700 : 550,
			distractors: params.difficulty === 'hard' && index % 2 === 1
		};
	});
}

function buildReactionTrials(params: {
	phase: CognitivePhase;
	count: number;
	preStimulusMs: number;
	responseWindowMs: number;
	responseMode: ReactionResponseMode;
}): ReactionBrakingTrial[] {
	return Array.from({ length: params.count }, (_, index) => {
		const stimulusKind: ReactionStimulusKind = index % 4 === 1 ? 'distractor' : 'hazard';
		const sideCycle: Array<'left' | 'right' | 'center'> =
			params.responseMode === 'selective' ? ['left', 'right', 'left', 'right'] : ['center', 'center', 'center', 'center'];
		return {
			id: `${params.phase}-${index + 1}`,
			phase: params.phase,
			index,
			stimulusKind,
			stimulusSide: stimulusKind === 'distractor' && params.responseMode === 'brake_only' ? 'center' : sideCycle[index % sideCycle.length],
			responseMode: params.responseMode,
			preStimulusMs: params.preStimulusMs + (index % 3) * 120,
			responseWindowMs: params.responseWindowMs
		};
	});
}

export function resolveDrivingPsychotechConfig(
	input: Record<string, unknown>
): DrivingPsychotechConfig {
	const difficulty = resolveDifficulty(input.difficulty);
	const testType = sanitizeChoice(
		input.testType,
		['bimanual_coordination', 'time_to_contact', 'multiple_reaction_braking'],
		'time_to_contact'
	);

	if (testType === 'bimanual_coordination') {
		const defaults = BIMANUAL_DEFAULTS[difficulty];
		return {
			title:
				typeof input.title === 'string' && input.title.trim().length > 0
					? input.title.trim()
					: 'Coordinacion Bimanual',
			testType,
			difficulty,
			instructions:
				typeof input.instructions === 'string' && input.instructions.trim().length > 0
					? input.instructions.trim()
					: DEFAULT_INSTRUCTIONS[testType],
			practiceDurationSec: sanitizePositiveInteger(
				input.practiceDurationSec,
				defaults.practiceDurationSec,
				4,
				60
			),
			durationSec: sanitizePositiveInteger(input.durationSec, defaults.durationSec, 10, 120),
			sampleMs: 250,
			trackHalfWidth: defaults.trackHalfWidth,
			scrollSpeed: defaults.scrollSpeed,
			inputSpeed: defaults.inputSpeed,
			curveAmplitudeLeft: defaults.curveAmplitudeLeft,
			curveAmplitudeRight: defaults.curveAmplitudeRight,
			portraitPreferred: true
		};
	}

	if (testType === 'time_to_contact') {
		const defaults = TTC_DEFAULTS[difficulty];
		const practiceTrials = sanitizePositiveInteger(input.practiceTrials, defaults.practiceTrials, 0, 12);
		const mainTrials = sanitizePositiveInteger(input.mainTrials, defaults.mainTrials, 4, 24);
		return {
			title:
				typeof input.title === 'string' && input.title.trim().length > 0
					? input.title.trim()
					: 'Anticipacion de Velocidad y Tiempo',
			testType,
			difficulty,
			instructions:
				typeof input.instructions === 'string' && input.instructions.trim().length > 0
					? input.instructions.trim()
					: DEFAULT_INSTRUCTIONS[testType],
			practiceTrials: buildTimeToContactTrials({
				phase: 'practice',
				count: practiceTrials,
				baseVisibleMs: defaults.baseVisibleMs,
				baseOcclusionMs: defaults.baseOcclusionMs,
				difficulty
			}),
			mainTrials: buildTimeToContactTrials({
				phase: 'main',
				count: mainTrials,
				baseVisibleMs: defaults.baseVisibleMs,
				baseOcclusionMs: defaults.baseOcclusionMs,
				difficulty
			}),
			onTimeThresholdMs: defaults.onTimeThresholdMs
		};
	}

	const defaults = REACTION_DEFAULTS[difficulty];
	const responseMode = sanitizeChoice(
		input.responseMode,
		['brake_only', 'selective'],
		defaults.responseMode
	);
	const practiceTrials = sanitizePositiveInteger(input.practiceTrials, defaults.practiceTrials, 0, 12);
	const mainTrials = sanitizePositiveInteger(input.mainTrials, defaults.mainTrials, 4, 28);
	return {
		title:
			typeof input.title === 'string' && input.title.trim().length > 0
				? input.title.trim()
				: 'Tiempo de Reaccion y Frenado',
		testType,
		difficulty,
		instructions:
			typeof input.instructions === 'string' && input.instructions.trim().length > 0
				? input.instructions.trim()
				: DEFAULT_INSTRUCTIONS[testType],
		practiceTrials: buildReactionTrials({
			phase: 'practice',
			count: practiceTrials,
			preStimulusMs: defaults.preStimulusMs,
			responseWindowMs: defaults.responseWindowMs,
			responseMode
		}),
		mainTrials: buildReactionTrials({
			phase: 'main',
			count: mainTrials,
			preStimulusMs: defaults.preStimulusMs,
			responseWindowMs: defaults.responseWindowMs,
			responseMode
		}),
		responseMode
	};
}

export function getExpectedReactionResponse(trial: ReactionBrakingTrial): ReactionResponse {
	if (trial.stimulusKind === 'distractor') return null;
	if (trial.responseMode === 'brake_only') return 'brake';
	return trial.stimulusSide === 'left' ? 'left' : 'right';
}

export function buildBimanualPayload(params: {
	difficulty: Difficulty;
	segmentLog: BimanualSegmentLog[];
	summaryInput: BimanualSummaryInput;
}): DrivingPsychotechPayload {
	const totalDurationMs = Math.max(1, Math.round(params.summaryInput.totalDurationMs));
	const percentOnTrackLeft = Math.round((params.summaryInput.onTrackLeftMs / totalDurationMs) * 100);
	const percentOnTrackRight = Math.round((params.summaryInput.onTrackRightMs / totalDurationMs) * 100);
	const simultaneousOffTrackMs = Math.round(params.summaryInput.simultaneousOffTrackMs);
	const meanAbsoluteOffsetLeft = Number(params.summaryInput.meanAbsoluteOffsetLeft.toFixed(3));
	const meanAbsoluteOffsetRight = Number(params.summaryInput.meanAbsoluteOffsetRight.toFixed(3));
	const rawScore =
		((percentOnTrackLeft + percentOnTrackRight) / 2 -
			(params.summaryInput.offTrackEventsLeft + params.summaryInput.offTrackEventsRight) * 1.6 -
			(simultaneousOffTrackMs / totalDurationMs) * 20) /
		100;
	const score = Number(Math.max(0, Math.min(1, rawScore)).toFixed(3));
	return {
		testType: 'bimanual_coordination',
		difficulty: params.difficulty,
		summary: {
			totalDurationMs,
			percentOnTrackLeft,
			percentOnTrackRight,
			simultaneousOffTrackMs,
			offTrackEventsLeft: params.summaryInput.offTrackEventsLeft,
			offTrackEventsRight: params.summaryInput.offTrackEventsRight,
			meanAbsoluteOffsetLeft,
			meanAbsoluteOffsetRight,
			score
		},
		segmentLog: params.segmentLog,
		score,
		completed: true
	};
}

export function buildTimeToContactPayload(params: {
	difficulty: Difficulty;
	trialLog: TimeToContactTrialLog[];
}): DrivingPsychotechPayload {
	const mainLogs = params.trialLog.filter((entry) => entry.phase === 'main');
	const signedMeanErrorMs = meanRounded(
		mainLogs.map((entry) => (typeof entry.errorMs === 'number' ? entry.errorMs : null))
	);
	const meanAbsoluteErrorMs = meanRounded(
		mainLogs.map((entry) => (typeof entry.absErrorMs === 'number' ? entry.absErrorMs : null))
	);
	const onTimeCount = mainLogs.filter((entry) => entry.outcome === 'on_time').length;
	const earlyCount = mainLogs.filter((entry) => entry.outcome === 'early').length;
	const lateCount = mainLogs.filter((entry) => entry.outcome === 'late').length;
	const missCount = mainLogs.filter((entry) => entry.outcome === 'miss').length;
	const score = Number(
		Math.max(
			0,
			Math.min(1, scoreRatio(onTimeCount + mainLogs.filter((entry) => entry.outcome === 'late').length * 0.4, Math.max(1, mainLogs.length)))
		).toFixed(3)
	);
	return {
		testType: 'time_to_contact',
		difficulty: params.difficulty,
		summary: {
			meanAbsoluteErrorMs,
			signedMeanErrorMs,
			onTimeCount,
			earlyCount,
			lateCount,
			missCount,
			score
		},
		trialLog: params.trialLog,
		score,
		completed: true
	};
}

export function buildReactionBrakingPayload(params: {
	difficulty: Difficulty;
	trialLog: ReactionBrakingTrialLog[];
}): DrivingPsychotechPayload {
	const mainLogs = params.trialLog.filter((entry) => entry.phase === 'main');
	const hits = mainLogs.filter((entry) => entry.outcome === 'hit').length;
	const misses = mainLogs.filter((entry) => entry.outcome === 'miss').length;
	const falseAlarms = mainLogs.filter((entry) => entry.outcome === 'false_alarm').length;
	const wrongSide = mainLogs.filter((entry) => entry.outcome === 'wrong_side').length;
	const correctRejections = mainLogs.filter((entry) => entry.outcome === 'correct_rejection').length;
	const meanReactionMs = meanRounded(
		mainLogs.map((entry) => (entry.outcome === 'hit' ? entry.reactionMs : null))
	);
	const score = Number(
		Math.max(
			0,
			Math.min(1, (hits + correctRejections * 0.5 - falseAlarms * 0.5 - wrongSide * 0.75) / Math.max(1, mainLogs.length))
		).toFixed(3)
	);
	return {
		testType: 'multiple_reaction_braking',
		difficulty: params.difficulty,
		summary: {
			hits,
			misses,
			falseAlarms,
			wrongSide,
			correctRejections,
			meanReactionMs,
			score
		},
		trialLog: params.trialLog,
		score,
		completed: true
	};
}

export function buildTimeToContactTrialLog(params: {
	trial: TimeToContactTrial;
	responseAtMs: number | null;
	onTimeThresholdMs: number;
}): TimeToContactTrialLog {
	const predictedExitAtMs = params.trial.visibleDurationMs + params.trial.occlusionMs;
	if (params.responseAtMs === null) {
		return {
			trialId: params.trial.id,
			phase: params.trial.phase,
			index: params.trial.index,
			speedNorm: params.trial.speedNorm,
			occlusionMs: params.trial.occlusionMs,
			predictedExitAtMs,
			responseAtMs: null,
			errorMs: null,
			absErrorMs: null,
			outcome: 'miss'
		};
	}

	const errorMs = Math.round(params.responseAtMs - predictedExitAtMs);
	const absErrorMs = Math.abs(errorMs);
	const outcome =
		absErrorMs <= params.onTimeThresholdMs
			? 'on_time'
			: errorMs < 0
				? 'early'
				: 'late';
	return {
		trialId: params.trial.id,
		phase: params.trial.phase,
		index: params.trial.index,
		speedNorm: params.trial.speedNorm,
		occlusionMs: params.trial.occlusionMs,
		predictedExitAtMs,
		responseAtMs: Math.round(params.responseAtMs),
		errorMs,
		absErrorMs,
		outcome
	};
}

export function buildReactionBrakingTrialLog(params: {
	trial: ReactionBrakingTrial;
	actualResponse: ReactionResponse;
	reactionMs: number | null;
}): ReactionBrakingTrialLog {
	const expectedResponse = getExpectedReactionResponse(params.trial);
	let outcome: ReactionBrakingTrialLog['outcome'];
	if (expectedResponse === null) {
		outcome = params.actualResponse === null ? 'correct_rejection' : 'false_alarm';
	} else if (params.actualResponse === null) {
		outcome = 'miss';
	} else if (params.actualResponse === expectedResponse) {
		outcome = 'hit';
	} else {
		outcome = 'wrong_side';
	}

	return {
		trialId: params.trial.id,
		phase: params.trial.phase,
		index: params.trial.index,
		stimulusKind: params.trial.stimulusKind,
		stimulusSide: params.trial.stimulusSide,
		expectedResponse,
		actualResponse: params.actualResponse,
		reactionMs: params.actualResponse === null ? null : params.reactionMs,
		outcome
	};
}

export function getDrivingPsychotechLabel(testType: DrivingPsychotechTestType): string {
	if (testType === 'bimanual_coordination') return 'Coordinacion Bimanual';
	if (testType === 'time_to_contact') return 'Anticipacion de Velocidad y Tiempo';
	return 'Tiempo de Reaccion y Frenado';
}

export function getDrivingPsychotechInterpretation(payload: DrivingPsychotechPayload): string {
	if (payload.testType === 'bimanual_coordination') {
		if (payload.score >= 0.82) return 'Control simultaneo estable y buena disociacion motora durante la fase principal.';
		if (payload.score >= 0.62) return 'Control funcional, con salidas puntuales de pista en los momentos de mayor asimetria.';
		return 'La coordinacion simultanea cae en los cambios de curva o velocidad; conviene repetir en ritmo moderado.';
	}

	if (payload.testType === 'time_to_contact') {
		if ((payload.summary.meanAbsoluteErrorMs ?? 999) <= 140) return 'Estimacion temporal consistente y ajustada durante la oclusion.';
		if ((payload.summary.meanAbsoluteErrorMs ?? 999) <= 240) return 'Estimacion util, aunque con variaciones en tuneles mas largos o velocidades altas.';
		return 'La anticipacion temporal muestra bastante dispersion; conviene reforzar el ritmo interno y la consistencia.';
	}

	if (payload.summary.falseAlarms === 0 && payload.summary.hits >= payload.summary.misses) {
		return 'Buena lectura de peligro y respuesta motora de emergencia con pocas activaciones espurias.';
	}
	if (payload.summary.falseAlarms <= 2) {
		return 'Respuesta valida, aunque con algun falso positivo o latencia en escenas mas cargadas.';
	}
	return 'La seleccion de respuesta se vuelve inestable con distractores; conviene repetir con menor carga perceptiva.';
}

export function parseInitialDrivingPsychotechPayload(
	value: Record<string, unknown> | undefined
): DrivingPsychotechPayload | null {
	if (!value || value.completed !== true) return null;
	const testType = sanitizeChoice(
		value.testType,
		['bimanual_coordination', 'time_to_contact', 'multiple_reaction_braking'],
		'time_to_contact'
	);
	if (!value.summary || typeof value.summary !== 'object') return null;
	if (testType === 'bimanual_coordination' && !Array.isArray(value.segmentLog)) return null;
	if (testType !== 'bimanual_coordination' && !Array.isArray(value.trialLog)) return null;
	return value as unknown as DrivingPsychotechPayload;
}
