import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Deep Linking content item', () => {
	it('builds an ltiResourceLink with Sapin custom ids', async () => {
		process.env.DATABASE_URL = process.env.DATABASE_URL || ':memory:';
		const { buildDeepLinkContentItem } = await import('./deepLinking.ts');
		const item = buildDeepLinkContentItem({
			origin: 'https://sapin.example.edu',
			courseId: 'course-1',
			activityId: 'activity-1',
			title: 'Actividad de chat',
			enableGradebook: false
		});

		assert.equal(item.type, 'ltiResourceLink');
		assert.equal(item.url, 'https://sapin.example.edu/lti/launch');
		assert.deepEqual(item.custom, {
			sapin_activity_id: 'activity-1',
			sapin_course_id: 'course-1'
		});
		assert.equal(item.lineItem, undefined);
	});

	it('adds a Moodle gradebook line item when requested', async () => {
		process.env.DATABASE_URL = process.env.DATABASE_URL || ':memory:';
		const { buildDeepLinkContentItem } = await import('./deepLinking.ts');
		const item = buildDeepLinkContentItem({
			origin: 'https://sapin.example.edu',
			courseId: 'course-1',
			activityId: 'activity-1',
			title: 'Actividad evaluada',
			enableGradebook: true
		});

		assert.equal(item.lineItem?.scoreMaximum, 100);
		assert.equal(item.lineItem?.resourceId, 'activity-1');
		assert.equal(item.lineItem?.tag, 'sapin:course-1:activity-1');
	});
});
