import { resolveDifficulty, type Difficulty } from './timed-quiz';
import {
	meanRounded,
	sanitizeChoice,
	sanitizePositiveInteger,
	scoreRatio,
	type CognitivePhase
} from './cognitive-tests';

export type WorkingMemoryTestType = 'digit_span';
export type DigitSpanMode = 'forward' | 'backward' | 'both';

export interface DigitSpanTrial {
	id: string;
	phase: CognitivePhase;
	mode: Exclude<DigitSpanMode, 'both'>;
	modeIndex: number;
	length: number;
	attemptIndex: number;
	sequence: number[];
	digitDisplayMs: number;
	digitGapMs: number;
	interTrialMs: number;
}

export interface DigitSpanTrialLog {
	trialId: string;
	phase: CognitivePhase;
	index: number;
	testType: WorkingMemoryTestType;
	mode: Exclude<DigitSpanMode, 'both'>;
	length: number;
	stimulus: string;
	expectedResponse: string;
	actualResponse: string | null;
	reactionMs: number | null;
	outcome: 'correct' | 'error';
	stimulusStartedAtMs: number;
	stimulusEndedAtMs: number;
	presentedSequence: number[];
	responseDigits: number[];
}

export interface WorkingMemorySummary {
	totalTrials: number;
	correctCount: number;
	errorCount: number;
	accuracy: number;
	maxForwardSpan: number;
	maxBackwardSpan: number;
	meanLengthCorrect: number | null;
	modesCompleted: Array<Exclude<DigitSpanMode, 'both'>>;
}

export interface WorkingMemoryPayload {
	testType: WorkingMemoryTestType;
	difficulty: Difficulty;
	mode: DigitSpanMode;
	summary: WorkingMemorySummary;
	trialLog: DigitSpanTrialLog[];
	score: number;
	completed: true;
}

export interface WorkingMemoryConfig {
	title: string;
	testType: WorkingMemoryTestType;
	mode: DigitSpanMode;
	difficulty: Difficulty;
	instructions: string;
	practiceTrials: DigitSpanTrial[];
	startLength: number;
	maxLength: number;
	trialsPerLength: number;
	digitDisplayMs: number;
	digitGapMs: number;
	interTrialMs: number;
}

const DEFAULTS: Record<
	Difficulty,
	{
		startLength: number;
		maxLength: number;
		trialsPerLength: number;
		digitDisplayMs: number;
		digitGapMs: number;
		interTrialMs: number;
	}
> = {
	easy: {
		startLength: 3,
		maxLength: 7,
		trialsPerLength: 2,
		digitDisplayMs: 900,
		digitGapMs: 260,
		interTrialMs: 900
	},
	medium: {
		startLength: 4,
		maxLength: 8,
		trialsPerLength: 2,
		digitDisplayMs: 760,
		digitGapMs: 220,
		interTrialMs: 780
	},
	hard: {
		startLength: 5,
		maxLength: 9,
		trialsPerLength: 2,
		digitDisplayMs: 620,
		digitGapMs: 180,
		interTrialMs: 640
	}
};

function buildDigitSequence(length: number, salt: number): number[] {
	return Array.from({ length }, (_, index) => ((length * 3 + salt * 5 + index * 7) % 9) + 1);
}

function normalizeMode(value: unknown): DigitSpanMode {
	return sanitizeChoice(value, ['forward', 'backward', 'both'], 'both');
}

export function buildDigitSpanTrial(params: {
	phase: CognitivePhase;
	mode: Exclude<DigitSpanMode, 'both'>;
	modeIndex: number;
	length: number;
	attemptIndex: number;
	digitDisplayMs: number;
	digitGapMs: number;
	interTrialMs: number;
}): DigitSpanTrial {
	const sequence = buildDigitSequence(
		params.length,
		params.modeIndex * 100 + params.length * 10 + params.attemptIndex
	);
	return {
		id: `${params.phase}-${params.mode}-${params.length}-${params.attemptIndex + 1}`,
		phase: params.phase,
		mode: params.mode,
		modeIndex: params.modeIndex,
		length: params.length,
		attemptIndex: params.attemptIndex,
		sequence,
		digitDisplayMs: params.digitDisplayMs,
		digitGapMs: params.digitGapMs,
		interTrialMs: params.interTrialMs
	};
}

export function resolveWorkingMemoryConfig(
	input: Record<string, unknown>
): WorkingMemoryConfig {
	const difficulty = resolveDifficulty(input.difficulty);
	const defaults = DEFAULTS[difficulty];
	const mode = normalizeMode(input.mode);
	const startLength = sanitizePositiveInteger(input.startLength, defaults.startLength, 2, 9);
	const maxLength = sanitizePositiveInteger(input.maxLength, defaults.maxLength, startLength, 12);
	const trialsPerLength = sanitizePositiveInteger(
		input.trialsPerLength,
		defaults.trialsPerLength,
		1,
		4
	);

	const modes = mode === 'both' ? (['forward', 'backward'] as const) : ([mode] as const);
	const practiceTrials = modes.map((entry, index) =>
		buildDigitSpanTrial({
			phase: 'practice',
			mode: entry,
			modeIndex: index,
			length: Math.max(2, startLength - 1),
			attemptIndex: 0,
			digitDisplayMs: defaults.digitDisplayMs,
			digitGapMs: defaults.digitGapMs,
			interTrialMs: defaults.interTrialMs
		})
	);

	return {
		title:
			typeof input.title === 'string' && input.title.trim().length > 0
				? input.title.trim()
				: 'Digit Span',
		testType: 'digit_span',
		mode,
		difficulty,
		instructions:
			typeof input.instructions === 'string' && input.instructions.trim().length > 0
				? input.instructions.trim()
				: mode === 'backward'
					? 'Memoriza la secuencia y escribela en orden inverso.'
					: mode === 'forward'
						? 'Memoriza la secuencia y escribela en el mismo orden.'
						: 'Haras una ronda directa y otra inversa. Memoriza cada secuencia y respondela cuando aparezca el teclado.',
		practiceTrials,
		startLength,
		maxLength,
		trialsPerLength,
		digitDisplayMs: defaults.digitDisplayMs,
		digitGapMs: defaults.digitGapMs,
		interTrialMs: defaults.interTrialMs
	};
}

export function getExpectedDigitSpanResponse(trial: DigitSpanTrial): number[] {
	return trial.mode === 'backward' ? [...trial.sequence].reverse() : trial.sequence;
}

export function buildDigitSpanTrialLog(params: {
	trial: DigitSpanTrial;
	index: number;
	actualDigits: number[];
	reactionMs: number | null;
	stimulusStartedAtMs: number;
	stimulusEndedAtMs: number;
}): DigitSpanTrialLog {
	const expectedDigits = getExpectedDigitSpanResponse(params.trial);
	const isCorrect =
		expectedDigits.length === params.actualDigits.length &&
		expectedDigits.every((digit, index) => digit === params.actualDigits[index]);

	return {
		trialId: params.trial.id,
		phase: params.trial.phase,
		index: params.index,
		testType: 'digit_span',
		mode: params.trial.mode,
		length: params.trial.length,
		stimulus: params.trial.sequence.join(' '),
		expectedResponse: expectedDigits.join(''),
		actualResponse: params.actualDigits.length > 0 ? params.actualDigits.join('') : null,
		reactionMs: params.reactionMs,
		outcome: isCorrect ? 'correct' : 'error',
		stimulusStartedAtMs: params.stimulusStartedAtMs,
		stimulusEndedAtMs: params.stimulusEndedAtMs,
		presentedSequence: params.trial.sequence,
		responseDigits: params.actualDigits
	};
}

export function buildWorkingMemoryPayload(params: {
	difficulty: Difficulty;
	mode: DigitSpanMode;
	trialLog: DigitSpanTrialLog[];
}): WorkingMemoryPayload {
	const mainLogs = params.trialLog.filter((entry) => entry.phase === 'main');
	const correctLogs = mainLogs.filter((entry) => entry.outcome === 'correct');
	const maxForwardSpan = correctLogs
		.filter((entry) => entry.mode === 'forward')
		.reduce((max, entry) => Math.max(max, entry.length), 0);
	const maxBackwardSpan = correctLogs
		.filter((entry) => entry.mode === 'backward')
		.reduce((max, entry) => Math.max(max, entry.length), 0);

	const summary: WorkingMemorySummary = {
		totalTrials: mainLogs.length,
		correctCount: correctLogs.length,
		errorCount: mainLogs.length - correctLogs.length,
		accuracy: scoreRatio(correctLogs.length, mainLogs.length),
		maxForwardSpan,
		maxBackwardSpan,
		meanLengthCorrect: meanRounded(correctLogs.map((entry) => entry.length)),
		modesCompleted: Array.from(new Set(mainLogs.map((entry) => entry.mode)))
	};

	return {
		testType: 'digit_span',
		difficulty: params.difficulty,
		mode: params.mode,
		summary,
		trialLog: params.trialLog,
		score: summary.accuracy,
		completed: true
	};
}

export function parseInitialWorkingMemoryPayload(
	value: Record<string, unknown> | undefined
): WorkingMemoryPayload | null {
	if (!value || value.completed !== true) return null;
	if (!value.summary || typeof value.summary !== 'object') return null;
	if (!Array.isArray(value.trialLog)) return null;
	return value as unknown as WorkingMemoryPayload;
}
