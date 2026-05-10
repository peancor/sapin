import test from 'node:test';
import assert from 'node:assert/strict';

import {
	canVerifyMoodleLink,
	createMoodleLinkVerification,
	type MoodleLinkVerificationContext
} from './moodleLinkVerification.ts';

function createContext(
	overrides: Partial<MoodleLinkVerificationContext> = {}
): MoodleLinkVerificationContext {
	return {
		activity: {
			id: 'activity-1',
			name: 'Actividad Moodle',
			type: 'chat',
			status: 'published'
		},
		course: {
			id: 'course-1',
			name: 'Curso Moodle'
		},
		systemRoleLevel: 0,
		courseRoleLevel: 50,
		...overrides
	};
}

test('canVerifyMoodleLink allows course staff', () => {
	assert.equal(canVerifyMoodleLink(createContext({ courseRoleLevel: 50 })), true);
});

test('canVerifyMoodleLink allows system admins without a course role', () => {
	assert.equal(
		canVerifyMoodleLink(createContext({ courseRoleLevel: null, systemRoleLevel: 90 })),
		true
	);
});

test('canVerifyMoodleLink rejects non-staff users', () => {
	assert.equal(canVerifyMoodleLink(createContext({ courseRoleLevel: 10 })), false);
	assert.equal(canVerifyMoodleLink(createContext({ courseRoleLevel: null })), false);
});

test('createMoodleLinkVerification exposes received id details for staff', () => {
	const verification = createMoodleLinkVerification(createContext(), {
		name: 'id',
		value: '12345'
	});

	assert.deepEqual(verification, {
		kind: 'moodle-link-verification',
		activityId: 'activity-1',
		activityName: 'Actividad Moodle',
		activityType: 'chat',
		activityStatus: 'published',
		courseId: 'course-1',
		courseName: 'Curso Moodle',
		parameterName: 'id',
		parameterValue: '12345',
		isLegacyParameter: false,
		hasIdentifier: true,
		hasValidIdentifier: true
	});
});

test('createMoodleLinkVerification marks missing and legacy parameters', () => {
	const missing = createMoodleLinkVerification(createContext(), null);
	assert.equal(missing?.hasIdentifier, false);
	assert.equal(missing?.hasValidIdentifier, false);
	assert.equal(missing?.parameterName, null);

	const legacy = createMoodleLinkVerification(createContext(), {
		name: 'externalId',
		value: '98765'
	});
	assert.equal(legacy?.isLegacyParameter, true);
	assert.equal(legacy?.hasValidIdentifier, true);
});

test('createMoodleLinkVerification rejects unsubstituted Moodle variables as invalid', () => {
	const verification = createMoodleLinkVerification(createContext(), {
		name: 'id',
		value: '{userid}'
	});

	assert.equal(verification?.hasIdentifier, true);
	assert.equal(verification?.hasValidIdentifier, false);
});

test('createMoodleLinkVerification returns null for non-staff users', () => {
	assert.equal(
		createMoodleLinkVerification(createContext({ courseRoleLevel: 10 }), {
			name: 'id',
			value: '12345'
		}),
		null
	);
});
