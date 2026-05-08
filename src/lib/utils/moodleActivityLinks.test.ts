import test from 'node:test';
import assert from 'node:assert/strict';

import {
	buildMoodleActivityBaseUrl,
	buildMoodleActivityFilterCodesUrl,
	getMoodleActivityStudentPath
} from './moodleActivityLinks.ts';

const origin = 'https://sapin.example.edu';

test('getMoodleActivityStudentPath resolves chat activities', () => {
	assert.equal(
		getMoodleActivityStudentPath({ id: 'chat-1', type: 'chat' }),
		'/student/run-chat/chat-1'
	);
});

test('getMoodleActivityStudentPath resolves agent activities', () => {
	assert.equal(
		getMoodleActivityStudentPath({ id: 'agent-1', type: 'agent' }),
		'/student/run-agent/agent-1'
	);
});

test('getMoodleActivityStudentPath resolves lesson activities', () => {
	assert.equal(
		getMoodleActivityStudentPath({ id: 'lesson-1', type: 'lesson' }),
		'/student/run-lesson/lesson-1'
	);
});

test('buildMoodleActivityBaseUrl builds the recommended Moodle URL without externalId', () => {
	const url = buildMoodleActivityBaseUrl({ id: 'activity-1', type: 'chat' }, `${origin}/`);

	assert.equal(url, `${origin}/student/run-chat/activity-1`);
	assert.equal(url.includes('externalId'), false);
});

test('buildMoodleActivityFilterCodesUrl builds the compatibility URL with FilterCodes', () => {
	assert.equal(
		buildMoodleActivityFilterCodesUrl({ id: 'activity-1', type: 'chat' }, origin),
		`${origin}/student/run-chat/activity-1?externalId={userid}`
	);
});
