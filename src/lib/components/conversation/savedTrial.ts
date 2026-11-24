/** Keep absence distinct from a saved omission. A zero is a valid digit, offset or time. */
function digits(value: unknown): string | undefined {
	if (
		Array.isArray(value) &&
		value.every((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)
	)
		return value.join(' ');
	if (typeof value === 'string' && /^[\d\s]+$/.test(value))
		return value.replace(/\s/g, '').split('').join(' ');
	return undefined;
}

export function readTrial(trial: Record<string, unknown>, testType: unknown) {
	let expected = trial.expectedResponse;
	let actual = trial.actualResponse;
	let stimulus = trial.stimulus;
	let time = trial.reactionMs;
	if (testType === 'digit_span') {
		stimulus = digits(trial.presentedSequence) ?? trial.stimulus;
		expected = digits(trial.expectedResponse) ?? trial.expectedResponse;
		actual = digits(trial.responseDigits) ?? digits(trial.actualResponse) ?? trial.actualResponse;
		if (actual === '') actual = null;
	} else if (testType === 'time_to_contact') {
		expected =
			typeof trial.predictedExitAtMs === 'number' ? trial.predictedExitAtMs + ' ms' : undefined;
		actual =
			typeof trial.responseAtMs === 'number' ? trial.responseAtMs + ' ms' : trial.responseAtMs;
		time = trial.errorMs;
	} else if (typeof trial.responded === 'boolean') {
		actual = trial.responded ? 'respond' : null;
		if (trial.kind === 'go') expected = 'respond';
		if (trial.kind === 'no-go') expected = null;
	}

	return {
		stimulus,
		expected,
		actual,
		time,
		mode: trial.mode,
		phase: trial.phase,
		outcome: trial.outcome
	};
}

export function percentOfWidth(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.round(value * 1000) / 10 + ' %'
		: '—';
}

export function trackMark(value: unknown): string {
	if (value === true) return '✓';
	if (value === false) return '×';
	return '—';
}
