import test from 'node:test';
import assert from 'node:assert/strict';

import { getYoutubeSegmentProgress, isYoutubeSegmentCompleteEnough } from './youtubeProgress.ts';

test('YouTube progress accepts the final sliver of short videos', () => {
	const progress = getYoutubeSegmentProgress({
		currentTime: 4.55,
		startSeconds: 0,
		duration: 5
	});

	assert.equal(Math.round(progress.watchPercent * 100), 91);
	assert.equal(progress.completeEnough, true);
});

test('YouTube progress only tolerates a few seconds on long videos', () => {
	assert.equal(
		isYoutubeSegmentCompleteEnough({
			currentTime: 545,
			startSeconds: 0,
			duration: 600
		}),
		false
	);
	assert.equal(
		isYoutubeSegmentCompleteEnough({
			currentTime: 596,
			startSeconds: 0,
			duration: 600
		}),
		true
	);
});
