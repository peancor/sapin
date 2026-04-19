import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLessonReviewAttemptSummary } from './LessonReviewUtils';
import type { LessonDefinition } from '$lib/types/lesson';

const definition: LessonDefinition = {
	version: '2',
	entryBlockId: 'intro',
	blocks: [
		{ id: 'intro', kind: 'content', title: 'Introducción', body: 'Hola', next: 'quiz' },
		{
			id: 'quiz',
			kind: 'check',
			title: 'Checkpoint',
			body: 'Responde',
			checkConfig: {
				mode: 'single_choice',
				maxAttempts: 2,
				completionRule: 'pass_or_exhaust',
				passingScore: 1,
				revealCorrectAnswer: false,
				options: [{ id: 'a', label: 'A', value: 'A' }],
				correctOptionIds: ['a'],
				acceptedExact: null,
				tolerance: null,
				acceptedAnswers: [],
				caseSensitive: false,
				trimWhitespace: true,
				matchMode: 'exact'
			},
			next: 'end'
		},
		{ id: 'end', kind: 'end', title: 'Fin', body: 'Bye' }
	]
};

test('buildLessonReviewAttemptSummary marks blocked checkpoints and repeated retries', () => {
	const summary = buildLessonReviewAttemptSummary({
		definition,
		session: {
			id: 'session-1',
			interactiveLearningId: 'lesson-1',
			userId: 'student-1',
			courseId: 'course-1',
			attemptNumber: 2,
			status: 'active',
			currentBlockId: 'quiz',
			currentVisitId: 'visit-2',
			sessionStateJson: null,
			startedAt: new Date('2026-04-19T10:00:00Z'),
			lastActiveAt: new Date('2026-04-19T10:20:00Z'),
			completedAt: null,
			createdAt: new Date('2026-04-19T10:00:00Z'),
			updatedAt: new Date('2026-04-19T10:20:00Z')
		},
		blockStates: [
			{
				id: 'state-quiz',
				sessionId: 'session-1',
				blockId: 'quiz',
				status: 'active',
				visitCount: 2,
				lastVisitId: 'visit-2',
				enteredAt: new Date('2026-04-19T10:05:00Z'),
				completedAt: null,
				lastChoiceValue: null,
				outputsJson: JSON.stringify({ passed: false, attemptCount: 2 }),
				chatId: null,
				metadata: null,
				createdAt: new Date('2026-04-19T10:05:00Z'),
				updatedAt: new Date('2026-04-19T10:20:00Z')
			}
		],
		blockVisits: [
			{
				id: 'visit-1',
				sessionId: 'session-1',
				blockId: 'intro',
				visitNumber: 1,
				status: 'completed',
				enteredAt: new Date('2026-04-19T10:00:00Z'),
				completedAt: new Date('2026-04-19T10:02:00Z'),
				lastChoiceValue: null,
				outputsJson: null,
				chatId: null,
				metadata: null,
				createdAt: new Date('2026-04-19T10:00:00Z'),
				updatedAt: new Date('2026-04-19T10:02:00Z')
			},
			{
				id: 'visit-2',
				sessionId: 'session-1',
				blockId: 'quiz',
				visitNumber: 2,
				status: 'active',
				enteredAt: new Date('2026-04-19T10:05:00Z'),
				completedAt: null,
				lastChoiceValue: null,
				outputsJson: JSON.stringify({ passed: false, attemptCount: 2 }),
				chatId: null,
				metadata: null,
				createdAt: new Date('2026-04-19T10:05:00Z'),
				updatedAt: new Date('2026-04-19T10:20:00Z')
			}
		],
		events: []
	});

	assert.equal(summary.reviewStatus, 'attention');
	assert.equal(summary.checkRetryBlocks, 1);
	assert.deepEqual(
		summary.alerts.map((alert) => alert.kind).sort(),
		['checkpoint_blocked', 'looping_path', 'repeated_retry'].sort()
	);
});

test('buildLessonReviewAttemptSummary marks branching complexity for long branched paths', () => {
	const summary = buildLessonReviewAttemptSummary({
		definition,
		session: {
			id: 'session-2',
			interactiveLearningId: 'lesson-1',
			userId: 'student-1',
			courseId: 'course-1',
			attemptNumber: 3,
			status: 'completed',
			currentBlockId: 'end',
			currentVisitId: 'visit-3',
			sessionStateJson: null,
			startedAt: new Date('2026-04-19T10:00:00Z'),
			lastActiveAt: new Date('2026-04-19T10:20:00Z'),
			completedAt: new Date('2026-04-19T10:20:00Z'),
			createdAt: new Date('2026-04-19T10:00:00Z'),
			updatedAt: new Date('2026-04-19T10:20:00Z')
		},
		blockStates: [],
		blockVisits: [],
		events: [
			{
				id: 'event-1',
				interactiveLearningId: 'lesson-1',
				sessionId: 'session-2',
				userId: 'student-1',
				courseId: 'course-1',
				visitId: 'visit-1',
				blockId: 'intro',
				eventType: 'branch_taken',
				payloadJson: null,
				createdAt: new Date('2026-04-19T10:05:00Z')
			},
			{
				id: 'event-2',
				interactiveLearningId: 'lesson-1',
				sessionId: 'session-2',
				userId: 'student-1',
				courseId: 'course-1',
				visitId: 'visit-2',
				blockId: 'quiz',
				eventType: 'branch_taken',
				payloadJson: null,
				createdAt: new Date('2026-04-19T10:10:00Z')
			},
			{
				id: 'event-3',
				interactiveLearningId: 'lesson-1',
				sessionId: 'session-2',
				userId: 'student-1',
				courseId: 'course-1',
				visitId: 'visit-3',
				blockId: 'quiz',
				eventType: 'branch_taken',
				payloadJson: null,
				createdAt: new Date('2026-04-19T10:15:00Z')
			}
		]
	});

	assert.equal(summary.reviewStatus, 'completed');
	assert.ok(summary.alerts.some((alert) => alert.kind === 'branch_complexity'));
});
