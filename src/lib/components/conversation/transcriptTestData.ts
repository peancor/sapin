import * as m from '$lib/paraglide/messages';
import { resultRecord } from '$lib/utils/agentToolActivity';
import { percentOfWidth } from './savedTrial';
import { sustainedAttentionInstructions } from '../agent/ui/shared/sustained-attention';
import { attentionControlInstructions } from '../agent/ui/shared/attention-control';
import { drivingInstructions } from '../agent/ui/shared/driving-psychotech';

export const cognitiveTestTitles: Record<string, () => string> = {
	SustainedAttentionTest: m.transcript_sustained,
	AttentionControlTest: m.transcript_attention,
	WorkingMemoryTest: m.transcript_memory,
	DrivingPsychotechTest: m.transcript_driving,
	ExecutiveFlexibilityTest: m.transcript_executive
};

export function testInstructions(key: string, props: Record<string, unknown>): string {
	if (typeof props.instructions === 'string' && props.instructions.trim())
		return props.instructions;
	switch (key) {
		case 'SustainedAttentionTest':
			return sustainedAttentionInstructions;
		case 'WorkingMemoryTest':
			if (props.mode === 'forward') return m.transcript_working_forward();
			if (props.mode === 'backward') return m.transcript_working_backward();
			return m.transcript_working_both();
		case 'AttentionControlTest':
			if (props.testType === 'sdmt') return '';
			return attentionControlInstructions[
				props.testType === 'go_no_go' || props.testType === 'flanker' ? props.testType : 'stroop'
			];
		case 'DrivingPsychotechTest':
			return drivingInstructions[
				props.testType === 'bimanual_coordination' || props.testType === 'multiple_reaction_braking'
					? props.testType
					: 'time_to_contact'
			];
		default:
			return '';
	}
}

const metricLabels = {
	totalTrials: m.transcript_total_trials,
	hits: m.transcript_hits,
	goTrials: m.transcript_go_trials,
	noGoTrials: m.transcript_no_go_trials,
	correctCount: m.transcript_correct_count,
	errorCount: m.transcript_error_count,
	accuracy: m.transcript_accuracy,
	commissionErrors: m.transcript_commission_errors,
	omissionErrors: m.transcript_omission_errors,
	congruentTrials: m.transcript_congruent_trials,
	incongruentTrials: m.transcript_incongruent_trials,
	congruentMeanReactionMs: m.transcript_congruent_rt,
	incongruentMeanReactionMs: m.transcript_incongruent_rt,
	meanReactionMs: m.transcript_mean_reaction_ms,
	interferenceCost: m.transcript_interference_cost,
	conflictCost: m.transcript_conflict_cost,
	maxForwardSpan: m.transcript_max_forward_span,
	maxBackwardSpan: m.transcript_max_backward_span,
	meanLengthCorrect: m.transcript_mean_length_correct,
	percentOnTrackLeft: m.transcript_percent_on_track_left,
	percentOnTrackRight: m.transcript_percent_on_track_right,
	offTrackEventsLeft: m.transcript_off_track_events_left,
	offTrackEventsRight: m.transcript_off_track_events_right,
	simultaneousOffTrackMs: m.transcript_simultaneous_off_track_ms,
	meanAbsoluteErrorMs: m.transcript_mean_absolute_error_ms,
	signedMeanErrorMs: m.transcript_signed_mean,
	meanAbsoluteOffsetLeft: m.transcript_left_mean,
	meanAbsoluteOffsetRight: m.transcript_right_mean,
	totalDurationMs: m.transcript_total_duration,
	misses: m.transcript_miss_count,
	onTimeCount: m.transcript_on_time_count,
	earlyCount: m.transcript_early_count,
	lateCount: m.transcript_late_count,
	missCount: m.transcript_miss_count,
	falseAlarms: m.transcript_false_alarms,
	wrongSide: m.transcript_wrong_side,
	correctRejections: m.transcript_correct_rejections
};

export function savedMetrics(response: Record<string, unknown>) {
	const summary = response.summary ? resultRecord(response.summary) : response;
	return Object.entries(metricLabels).flatMap(([key, label]) => {
		const value = summary[key];
		if (typeof value !== 'number' || !Number.isFinite(value)) return [];
		let formatted = String(value);
		if (key === 'accuracy') formatted = Math.round(value * 100) + ' %';
		else if (key.startsWith('meanAbsoluteOffset')) formatted = percentOfWidth(value);
		else if (key.startsWith('percent')) formatted += ' %';
		else if (key.endsWith('Ms') || ['interferenceCost', 'conflictCost'].includes(key))
			formatted += ' ms';
		return [{ key, label: label(), value: formatted }];
	});
}

const terms: Record<string, () => string> = {
	practice: m.transcript_practice,
	main: m.transcript_main,
	respond: m.transcript_respond,
	forward: m.transcript_forward,
	backward: m.transcript_backward,
	left: m.transcript_left,
	right: m.transcript_right,
	center: m.transcript_center,
	hit: m.transcript_hit,
	error: m.transcript_error,
	commission: m.transcript_commission,
	omission: m.transcript_omission,
	correct_rejection: m.transcript_correct_rejection,
	miss: m.transcript_miss,
	false_alarm: m.transcript_false_alarm,
	wrong_side: m.transcript_wrong_side,
	on_time: m.transcript_on_time,
	early: m.transcript_early,
	late: m.transcript_late,
	hazard: m.transcript_hazard,
	distractor: m.transcript_distractor,
	brake: m.transcript_brake,
	correct: m.transcript_correct,
	timeout: m.transcript_timeout,
	'correct-rejection': m.transcript_correct_rejection
};

export function trialTerm(value: unknown): string {
	if (typeof value === 'boolean') return value ? m.transcript_respond() : '—';
	if (typeof value !== 'string' && typeof value !== 'number') return '—';
	return Object.hasOwn(terms, value) ? terms[value]() : String(value);
}

export function trialStimulus(trial: Record<string, unknown>) {
	if (typeof trial.stimulus === 'string') return trial.stimulus;
	if (trial.stimulusKind)
		return [trial.stimulusKind, trial.stimulusSide].map(trialTerm).join(' · ');
	if (typeof trial.occlusionMs === 'number')
		return m.transcript_occlusion({ ms: trial.occlusionMs });
	return '—';
}
