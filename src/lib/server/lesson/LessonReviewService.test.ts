import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildLessonReviewStudentDetail,
	buildLessonReviewStudentDirectory,
	buildLessonReviewStudentRows,
	requireLessonReviewStudent
} from './LessonReviewService.ts';
import { buildLessonReviewAttemptSummary } from './LessonReviewUtils.ts';
import type { LessonDefinition } from '$lib/types/lesson';
import type { LessonReviewAttemptSummary, LessonReviewStudent } from '$lib/types/lessonReview';

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
			definitionRevisionId: 'revision-1',
			definitionRevisionNumber: 1,
			bindingStatus: 'exact',
			scope: 'learner',
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
				scope: 'learner',
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
				scope: 'learner',
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
				scope: 'learner',
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
			definitionRevisionId: 'revision-2',
			definitionRevisionNumber: 2,
			bindingStatus: 'exact',
			scope: 'learner',
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
				scope: 'learner',
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
				scope: 'learner',
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
				scope: 'learner',
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

function createStudent(input: {
	id: string;
	username: string;
	audience: 'student' | 'staff';
	courseRole?: string;
}): LessonReviewStudent {
	return {
		id: input.id,
		username: input.username,
		email: `${input.id}@example.com`,
		image: null,
		alias: null,
		courseRole: input.courseRole ?? (input.audience === 'student' ? 'student' : 'teacher'),
		courseRoleLevel: input.audience === 'student' ? 10 : 50,
		audience: input.audience
	};
}

function createAttempt(input: {
	sessionId: string;
	userId: string;
	attemptNumber: number;
	reviewStatus: LessonReviewAttemptSummary['reviewStatus'];
	lastActiveAt: string;
	alertKinds?: LessonReviewAttemptSummary['alerts'][number]['kind'][];
	visitedBlocksCount?: number;
	totalBlocks?: number;
	checksPassed?: number;
	checksPending?: number;
	branchCount?: number;
	revisitedBlocks?: number;
	checkRetryBlocks?: number;
}): LessonReviewAttemptSummary {
	return {
		sessionId: input.sessionId,
		userId: input.userId,
		attemptNumber: input.attemptNumber,
		sessionStatus: input.reviewStatus === 'completed' ? 'completed' : 'active',
		definitionRevisionId: 'revision-summary',
		definitionRevisionNumber: 7,
		bindingStatus: 'exact',
		isHistoricalApproximation: false,
		reviewStatus: input.reviewStatus,
		currentBlockId: 'block-1',
		currentBlockTitle: 'Bloque',
		currentBlockKind: 'content',
		startedAt: new Date('2026-04-19T08:00:00Z'),
		lastActiveAt: new Date(input.lastActiveAt),
		completedAt: input.reviewStatus === 'completed' ? new Date(input.lastActiveAt) : null,
		visitedBlocksCount: input.visitedBlocksCount ?? 3,
		completedBlocksCount: input.reviewStatus === 'completed' ? input.visitedBlocksCount ?? 3 : 1,
		totalBlocks: input.totalBlocks ?? 5,
		totalVisits: input.visitedBlocksCount ?? 3,
		branchCount: input.branchCount ?? 0,
		checksPassed: input.checksPassed ?? 0,
		checksPending: input.checksPending ?? 0,
		checkRetryBlocks: input.checkRetryBlocks ?? 0,
		revisitedBlocks: input.revisitedBlocks ?? 0,
		hasAgentBlocks: false,
		alerts: (input.alertKinds ?? []).map((kind) => ({
			kind,
			label: kind,
			description: kind,
			severity: kind === 'checkpoint_blocked' ? 'critical' : 'warning'
		}))
	};
}

test('buildLessonReviewStudentDirectory keeps only alumnado rows and summarizes attempts', () => {
	const studentA = createStudent({ id: 'student-a', username: 'Ada', audience: 'student' });
	const studentB = createStudent({ id: 'student-b', username: 'Beto', audience: 'student' });
	const staff = createStudent({ id: 'staff-1', username: 'Staff', audience: 'staff' });
	const rows = buildLessonReviewStudentRows({
		participants: [studentB, staff, studentA],
		attemptsByUser: new Map([
			[
				studentA.id,
				[
					createAttempt({
						sessionId: 's-1',
						userId: studentA.id,
						attemptNumber: 1,
						reviewStatus: 'completed',
						lastActiveAt: '2026-04-19T10:00:00Z'
					})
				]
			],
			[
				staff.id,
				[
					createAttempt({
						sessionId: 's-staff',
						userId: staff.id,
						attemptNumber: 1,
						reviewStatus: 'attention',
						lastActiveAt: '2026-04-19T12:00:00Z',
						alertKinds: ['checkpoint_blocked']
					})
				]
			],
			[
				studentB.id,
				[
					createAttempt({
						sessionId: 's-2',
						userId: studentB.id,
						attemptNumber: 2,
						reviewStatus: 'active',
						lastActiveAt: '2026-04-19T11:00:00Z'
					}),
					createAttempt({
						sessionId: 's-3',
						userId: studentB.id,
						attemptNumber: 1,
						reviewStatus: 'attention',
						lastActiveAt: '2026-04-18T11:00:00Z',
						alertKinds: ['repeated_retry']
					})
				]
			]
		])
	});
	const directory = buildLessonReviewStudentDirectory(rows);

	assert.deepEqual(
		directory.students.map((row) => row.student.id),
		['student-b', 'student-a']
	);
	assert.equal(directory.summary.totalStudents, 2);
	assert.equal(directory.summary.studentsWithAttempts, 2);
	assert.equal(directory.summary.studentsCompleted, 1);
	assert.equal(directory.summary.studentsWithAlerts, 0);
	assert.equal(directory.summary.totalAttempts, 3);
	assert.equal(
		directory.summary.lastActivityAt?.toISOString(),
		'2026-04-19T11:00:00.000Z'
	);
});

test('buildLessonReviewStudentDetail orders attempts and aggregates summary metrics', () => {
	const student = createStudent({ id: 'student-a', username: 'Ada', audience: 'student' });
	const detail = buildLessonReviewStudentDetail({
		student,
		attempts: [
			createAttempt({
				sessionId: 's-old',
				userId: student.id,
				attemptNumber: 1,
				reviewStatus: 'completed',
				lastActiveAt: '2026-04-18T10:00:00Z',
				visitedBlocksCount: 4,
				checksPassed: 2,
				branchCount: 1
			}),
			createAttempt({
				sessionId: 's-new',
				userId: student.id,
				attemptNumber: 3,
				reviewStatus: 'attention',
				lastActiveAt: '2026-04-19T12:00:00Z',
				alertKinds: ['checkpoint_blocked', 'repeated_retry'],
				visitedBlocksCount: 5,
				checksPassed: 1,
				checksPending: 1,
				branchCount: 2,
				revisitedBlocks: 1,
				checkRetryBlocks: 1
			}),
			createAttempt({
				sessionId: 's-mid',
				userId: student.id,
				attemptNumber: 2,
				reviewStatus: 'active',
				lastActiveAt: '2026-04-19T09:00:00Z',
				visitedBlocksCount: 2,
				checksPending: 1
			})
		]
	});

	assert.deepEqual(detail.attempts.map((attempt) => attempt.sessionId), ['s-new', 's-mid', 's-old']);
	assert.equal(detail.latestAttempt?.sessionId, 's-new');
	assert.equal(detail.summary.totalAttempts, 3);
	assert.equal(detail.summary.completedAttempts, 1);
	assert.equal(detail.summary.activeAttempts, 1);
	assert.equal(detail.summary.attemptsWithAlerts, 1);
	assert.equal(detail.summary.totalAlerts, 2);
	assert.equal(detail.summary.totalVisitedBlocks, 11);
	assert.equal(detail.summary.totalChecksPassed, 3);
	assert.equal(detail.summary.totalChecksPending, 2);
	assert.equal(detail.summary.totalBranches, 3);
	assert.equal(detail.summary.totalRevisitedBlocks, 1);
	assert.equal(detail.summary.totalCheckRetryBlocks, 1);
	assert.equal(detail.summary.lastActivityAt?.toISOString(), '2026-04-19T12:00:00.000Z');
});

test('requireLessonReviewStudent rejects missing or staff participants with 404', () => {
	const student = createStudent({ id: 'student-a', username: 'Ada', audience: 'student' });
	const staff = createStudent({ id: 'staff-1', username: 'Staff', audience: 'staff' });

	assert.throws(
		() => requireLessonReviewStudent([student, staff], 'missing'),
		(error) =>
			error instanceof Error &&
			'status' in error &&
			error.status === 404
	);
	assert.throws(
		() => requireLessonReviewStudent([student, staff], staff.id),
		(error) =>
			error instanceof Error &&
			'status' in error &&
			error.status === 404
	);
});
