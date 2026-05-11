import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildRecomputedAttemptProgress,
	type AttemptProgressEvidence
} from './ActivityAttemptDeletionService.ts';

function evidence(input: Partial<AttemptProgressEvidence> = {}): AttemptProgressEvidence {
	return {
		startedAt: new Date('2026-04-20T10:00:00Z'),
		lastInteractionAt: new Date('2026-04-20T10:10:00Z'),
		completedAt: null,
		completed: false,
		timeSpentSeconds: 600,
		...input
	};
}

test('buildRecomputedAttemptProgress returns null when the last attempt was deleted', () => {
	assert.equal(buildRecomputedAttemptProgress([]), null);
});

test('buildRecomputedAttemptProgress rebuilds aggregate progress from remaining attempts', () => {
	const recomputed = buildRecomputedAttemptProgress([
		evidence({
			startedAt: new Date('2026-04-20T10:00:00Z'),
			lastInteractionAt: new Date('2026-04-20T10:15:00Z'),
			timeSpentSeconds: 900
		}),
		evidence({
			startedAt: new Date('2026-04-21T09:00:00Z'),
			lastInteractionAt: new Date('2026-04-21T09:30:00Z'),
			completedAt: new Date('2026-04-21T09:30:00Z'),
			completed: true,
			timeSpentSeconds: 1800
		})
	]);

	assert.ok(recomputed);
	assert.equal(recomputed.status, 'completed');
	assert.equal(recomputed.attemptsCount, 2);
	assert.equal(recomputed.timeSpentSeconds, 2700);
	assert.equal(recomputed.startedAt.toISOString(), '2026-04-20T10:00:00.000Z');
	assert.equal(recomputed.lastInteractionAt.toISOString(), '2026-04-21T09:30:00.000Z');
	assert.equal(recomputed.completedAt?.toISOString(), '2026-04-21T09:30:00.000Z');
});
