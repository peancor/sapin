import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDigitSpanTrialLog } from '../agent/ui/shared/working-memory.ts';
import { buildTimeToContactTrialLog } from '../agent/ui/shared/driving-psychotech.ts';
import {
	buildSustainedAttentionPayload,
	buildTrialResult
} from '../agent/ui/shared/sustained-attention.ts';
import { percentOfWidth, readTrial, trackMark } from './savedTrial.ts';

test('Digit Span preserves the presented sequence, reverse rule and actual answer including zero', () => {
	const log = buildDigitSpanTrialLog({
		trial: {
			id: 'memory',
			phase: 'main',
			mode: 'backward',
			modeIndex: 0,
			length: 3,
			attemptIndex: 0,
			sequence: [0, 2, 8],
			digitDisplayMs: 500,
			digitGapMs: 100,
			interTrialMs: 100
		},
		index: 0,
		actualDigits: [8, 2, 0],
		reactionMs: 401,
		stimulusStartedAtMs: 100,
		stimulusEndedAtMs: 200
	});
	const row = readTrial({ ...log }, 'digit_span');
	assert.equal(row.mode, 'backward');
	assert.equal(row.stimulus, '0 2 8');
	assert.equal(row.expected, '8 2 0');
	assert.equal(row.actual, '8 2 0');
	assert.equal(row.time, 401);
	assert.equal(readTrial({ responseDigits: [] }, 'digit_span').actual, null);
	assert.equal(readTrial({}, 'digit_span').actual, undefined);
});

test('an exactly timed response retains a zero signed error, independently of when the response was made', () => {
	const log = buildTimeToContactTrialLog({
		trial: {
			id: 'time',
			phase: 'main',
			index: 0,
			speedNorm: 0.6,
			visibleDurationMs: 400,
			occlusionMs: 150,
			postExitWindowMs: 800,
			distractors: false
		},
		responseAtMs: 550,
		onTimeThresholdMs: 40
	});
	const row = readTrial({ ...log }, 'time_to_contact');
	assert.equal(row.actual, '550 ms');
	assert.equal(row.expected, '550 ms');
	assert.equal(row.time, 0);
	assert.equal(row.outcome, 'on_time');
});

test('Go/No-Go stores the stimulus and a correctly withheld response; missing bimanual samples are unknown', () => {
	const trial = buildTrialResult({
		trial: {
			id: 'hold',
			phase: 'main',
			index: 0,
			kind: 'no-go',
			stimulus: 'Círculo',
			stimulusDurationMs: 800,
			interStimulusMs: 500
		},
		responded: false,
		reactionMs: null
	});
	const payload = buildSustainedAttentionPayload({
		testType: 'go_no_go',
		difficulty: 'medium',
		results: [trial]
	});
	const row = readTrial({ ...payload.trialLog?.[0] }, payload.testType);
	assert.equal(row.stimulus, 'Círculo');
	assert.equal(row.actual, null);
	assert.equal(row.expected, null);
	assert.equal(row.outcome, 'correct-rejection');
	assert.equal(percentOfWidth(-0.125), '-12.5 %');
	assert.equal(percentOfWidth(0), '0 %');
	assert.equal(trackMark(undefined), '—');
	assert.equal(trackMark(false), '×');
});
