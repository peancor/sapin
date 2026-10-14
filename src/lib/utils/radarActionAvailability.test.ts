import test from 'node:test';
import assert from 'node:assert/strict';
import { radarActionAvailability } from './radarActionAvailability';
import type { RadarRunView } from '$lib/types/radar';

const start = Date.parse('2026-10-14T09:00:00Z');
const run: Pick<RadarRunView, 'startsAt' | 'endsAt' | 'state'> = {
	startsAt: new Date(start).toISOString(),
	endsAt: new Date(start + 30 * 60000).toISOString(),
	state: 'active'
};
test('preparation needs no run and never permits execution', () => {
	for (const window of ['all', 'recent', 'compare'] as const) {
		const result = radarActionAvailability({ window, minutes: 5 }, null, start);
		assert.equal(result.available, false);
		assert.match(result.message, window === 'compare' ? /10 minutos/ : /iniciar el seguimiento/);
	}
});
test('all and partial recent become available at start, but pending actions stay disabled', () => {
	assert.equal(
		radarActionAvailability({ window: 'all', minutes: 5 }, run, start - 1).available,
		false
	);
	assert.equal(radarActionAvailability({ window: 'all', minutes: 5 }, run, start).available, true);
	assert.match(
		radarActionAvailability({ window: 'recent', minutes: 5 }, run, start).message,
		/tiempo transcurrido/
	);
	assert.equal(
		radarActionAvailability({ window: 'all', minutes: 5 }, run, start, true).available,
		false
	);
});
test('comparison unlocks exactly when the server can capture two complete periods', () => {
	const action = { window: 'compare' as const, minutes: 5 };
	assert.equal(radarActionAvailability(action, run, start + 600000 - 2).available, false);
	assert.equal(radarActionAvailability(action, run, start + 600000 - 1).available, true);
	assert.match(radarActionAvailability(action, run, start + 600000 - 2).message, /0 min 1 s/);
});
test('closed short runs never unlock with elapsed wall time; complete closed runs remain usable', () => {
	const closed = {
		...run,
		state: 'finalized' as const,
		endsAt: new Date(start + 5 * 60000).toISOString()
	};
	const action = { window: 'compare' as const, minutes: 5 };
	assert.equal(radarActionAvailability(action, closed, start + 86400000).available, false);
	assert.match(radarActionAvailability(action, closed, start + 86400000).message, /no alcanza/);
	assert.equal(
		radarActionAvailability({ window: 'all', minutes: 5 }, closed, start + 86400000).available,
		true
	);
	assert.equal(
		radarActionAvailability(
			action,
			{ ...closed, endsAt: new Date(start + 600000).toISOString() },
			start + 86400000
		).available,
		true
	);
});
test('insufficient planned duration and unknown clocks explain why execution is unavailable', () => {
	assert.match(
		radarActionAvailability({ window: 'compare', minutes: 20 }, run, start).message,
		/duración prevista/
	);
	assert.equal(radarActionAvailability({ window: 'all', minutes: 5 }, run, NaN).available, false);
});
