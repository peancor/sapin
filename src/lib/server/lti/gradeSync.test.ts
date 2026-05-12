import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('AGS score payload', () => {
	it('uses a real normalized score when present', async () => {
		process.env.DATABASE_URL = process.env.DATABASE_URL || ':memory:';
		const { buildAgsScorePayload } = await import('./gradeSync.ts');
		const payload = buildAgsScorePayload({
			ltiUserId: 'moodle-sub-1',
			scoreNormalized: 87,
			now: new Date('2026-01-01T10:00:00.000Z')
		});

		assert.equal(payload.userId, 'moodle-sub-1');
		assert.equal(payload.activityProgress, 'Completed');
		assert.equal(payload.gradingProgress, 'FullyGraded');
		assert.equal(payload.scoreGiven, 87);
		assert.equal(payload.scoreMaximum, 100);
		assert.equal(payload.timestamp, '2026-01-01T10:00:00.000Z');
	});

	it('falls back to 100 when no score exists', async () => {
		process.env.DATABASE_URL = process.env.DATABASE_URL || ':memory:';
		const { buildAgsScorePayload } = await import('./gradeSync.ts');
		const payload = buildAgsScorePayload({
			ltiUserId: 'moodle-sub-2',
			scoreNormalized: null,
			now: new Date('2026-01-01T10:00:00.000Z')
		});

		assert.equal(payload.scoreGiven, 100);
	});
});
