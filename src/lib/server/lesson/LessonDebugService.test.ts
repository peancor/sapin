import test from 'node:test';
import assert from 'node:assert/strict';

import type {
	InteractiveLearning,
	InteractiveLessonBlockState,
	InteractiveLessonBlockVisit,
	InteractiveLessonEvent,
	InteractiveLessonSession
} from '../db/schema/index.ts';
import type { LessonDefinition } from '../../types/lesson.ts';
import {
	buildLessonDebugBlockSummaries,
	evaluateLessonDebugTransitions,
	pickLessonDebugPreviewSession
} from './lessonDebugUtils.ts';

const definition: LessonDefinition = {
	version: '2',
	entryBlockId: 'intro',
	blocks: [
		{
			id: 'intro',
			kind: 'content',
			title: 'Intro',
			body: 'Hola',
			next: 'check'
		},
		{
			id: 'check',
			kind: 'check',
			title: 'Check',
			body: 'Responde',
			branches: [
				{
					id: 'passed-branch',
					label: 'Si supera',
					targetBlockId: 'agent',
					condition: {
						source: 'blocks.check.outputs.passed',
						operator: 'equals',
						value: true
					}
				}
			],
			next: 'end',
			checkConfig: {
				maxAttempts: 2,
				completionRule: 'pass_or_exhaust',
				passingScore: 1,
				revealCorrectAnswer: false,
				presentationMode: 'all_at_once',
				aiGeneration: {
					model: '',
					objective: '',
					count: 3,
					difficulty: 'medium',
					allowedModes: ['single_choice', 'multiple_choice', 'true_false']
				},
				questions: [
					{
						id: 'question_1',
						prompt: 'Elige',
						mode: 'single_choice',
						options: [{ id: 'a', label: 'A', value: 'A' }],
						correctOptionIds: ['a']
					}
				]
			}
		},
		{
			id: 'agent',
			kind: 'agent',
			title: 'Tutor',
			body: 'Usa {{blocks.check.outputs.score}}',
			next: 'end',
			agentConfig: {
				runtimeMode: 'agent',
				interactionMode: 'single_turn',
				executionTrigger: 'on_user_submit',
				autoStartOnEnter: false,
				promptTemplate: 'Ayuda con {{blocks.check.outputs.score}}'
			}
		},
		{
			id: 'end',
			kind: 'end',
			title: 'Fin',
			body: 'Cierre'
		}
	]
};

const activity: InteractiveLearning = {
	id: 'lesson-1',
	type: 'lesson',
	name: 'Lesson demo',
	description: 'Descripcion',
	content: '{}',
	status: 'published',
	createdAt: new Date('2026-04-22T08:00:00Z'),
	updatedAt: new Date('2026-04-22T08:00:00Z'),
	publishedAt: null,
	closedAt: null,
	archivedAt: null,
	slug: 'lesson-demo',
	image: null,
	metadata: null
};

function createSession(overrides: Partial<InteractiveLessonSession> = {}): InteractiveLessonSession {
	return {
		id: 'session-1',
		interactiveLearningId: 'lesson-1',
		userId: 'user-1',
		courseId: 'course-1',
		attemptNumber: 1,
		definitionRevisionId: 'revision-1',
		definitionRevisionNumber: 1,
		bindingStatus: 'exact',
		scope: 'preview_draft',
		status: 'active',
		currentBlockId: 'check',
		currentVisitId: 'visit-check-2',
		sessionStateJson: JSON.stringify({ attemptNumber: 1 }),
		startedAt: new Date('2026-04-22T08:00:00Z'),
		lastActiveAt: new Date('2026-04-22T08:10:00Z'),
		completedAt: null,
		createdAt: new Date('2026-04-22T08:00:00Z'),
		updatedAt: new Date('2026-04-22T08:10:00Z'),
		...overrides
	};
}

function createBlockState(overrides: Partial<InteractiveLessonBlockState>): InteractiveLessonBlockState {
	return {
		id: 'state',
		sessionId: 'session-1',
		blockId: 'check',
		scope: 'preview_draft',
		status: 'active',
		visitCount: 2,
		lastVisitId: 'visit-check-2',
		enteredAt: new Date('2026-04-22T08:05:00Z'),
		completedAt: null,
		lastChoiceValue: null,
		outputsJson: JSON.stringify({ passed: false, score: 0.5, attemptCount: 2 }),
		chatId: null,
		metadata: null,
		createdAt: new Date('2026-04-22T08:05:00Z'),
		updatedAt: new Date('2026-04-22T08:10:00Z'),
		...overrides
	};
}

function createVisit(overrides: Partial<InteractiveLessonBlockVisit>): InteractiveLessonBlockVisit {
	return {
		id: 'visit',
		sessionId: 'session-1',
		blockId: 'check',
		scope: 'preview_draft',
		visitNumber: 1,
		status: 'active',
		enteredAt: new Date('2026-04-22T08:05:00Z'),
		completedAt: null,
		lastChoiceValue: null,
		outputsJson: JSON.stringify({ passed: false }),
		chatId: null,
		metadata: null,
		createdAt: new Date('2026-04-22T08:05:00Z'),
		updatedAt: new Date('2026-04-22T08:10:00Z'),
		...overrides
	};
}

function createEvent(overrides: Partial<InteractiveLessonEvent> = {}): InteractiveLessonEvent {
	return {
		id: 'event',
		interactiveLearningId: 'lesson-1',
		sessionId: 'session-1',
		userId: 'user-1',
		courseId: 'course-1',
		scope: 'preview_draft',
		visitId: null,
		blockId: 'check',
		eventType: 'branch_taken',
		payloadJson: JSON.stringify({ targetBlockId: 'agent' }),
		createdAt: new Date('2026-04-22T08:07:00Z'),
		...overrides
	};
}

test('pickLessonDebugPreviewSession prefers requested active session and ignores restarted ones', () => {
	const requested = createSession({ id: 'session-requested', attemptNumber: 3 });
	const restarted = createSession({
		id: 'session-restarted',
		attemptNumber: 4,
		status: 'restarted'
	});
	const picked = pickLessonDebugPreviewSession({
		requestedSessionId: 'session-requested',
		sessions: [restarted, requested]
	});

	assert.equal(picked?.id, 'session-requested');
});

test('evaluateLessonDebugTransitions resolves branch matches and fallback next correctly', () => {
	const session = createSession();
	const blockStates = [
		createBlockState({
			blockId: 'check',
			outputsJson: JSON.stringify({ passed: false, score: 0.5 })
		})
	];
	const block = definition.blocks.find((entry) => entry.id === 'check');
	if (!block || block.kind !== 'check') throw new Error('Expected check block');

	const evaluations = evaluateLessonDebugTransitions({
		block,
		resolvedBlock: block,
		session,
		activity,
		blockStates
	});

	assert.equal(evaluations.length, 2);
	assert.equal(evaluations[0]?.matches, false);
	assert.equal(evaluations[0]?.actualValue, false);
	assert.equal(evaluations[1]?.kind, 'next');
	assert.equal(evaluations[1]?.matches, true);
});

test('buildLessonDebugBlockSummaries marks current, completed and revisited blocks with alerts', () => {
	const session = createSession();
	const blockStates = [
		createBlockState({
			blockId: 'intro',
			status: 'completed',
			visitCount: 1,
			lastVisitId: 'visit-intro-1',
			outputsJson: JSON.stringify({ visited: true })
		}),
		createBlockState({
			blockId: 'check',
			status: 'active',
			visitCount: 2,
			lastVisitId: 'visit-check-2',
			outputsJson: JSON.stringify({ passed: false, attemptCount: 2 })
		})
	];
	const blockVisits = [
		createVisit({
			id: 'visit-intro-1',
			blockId: 'intro',
			visitNumber: 1,
			status: 'completed'
		}),
		createVisit({
			id: 'visit-check-1',
			blockId: 'check',
			visitNumber: 2,
			status: 'abandoned'
		}),
		createVisit({
			id: 'visit-check-2',
			blockId: 'check',
			visitNumber: 3,
			status: 'active'
		})
	];
	const events = [createEvent()];

	const summaries = buildLessonDebugBlockSummaries({
		definition,
		session,
		blockStates,
		blockVisits,
		events,
		selectedBlockId: 'check',
		getBlockGraphSummary: (currentDefinition, blockId) => ({
			blockId,
			incomingBlockIds: currentDefinition.blocks
				.filter(
					(block) =>
						block.next === blockId ||
						(block.branches ?? []).some((branch) => branch.targetBlockId === blockId)
				)
				.map((block) => block.id),
			outgoingBlockIds: [
				...new Set([
					...currentDefinition.blocks
						.filter((block) => block.id === blockId && block.next)
						.map((block) => block.next as string),
					...currentDefinition.blocks
						.filter((block) => block.id === blockId)
						.flatMap((block) => (block.branches ?? []).map((branch) => branch.targetBlockId))
				])
			],
			contracts: {
				blockId,
				blockTitle: currentDefinition.blocks.find((block) => block.id === blockId)?.title ?? blockId,
				blockKind: currentDefinition.blocks.find((block) => block.id === blockId)?.kind ?? 'content',
				state: [],
				outputs: []
			}
		})
	});

	const intro = summaries.find((summary) => summary.blockId === 'intro');
	const check = summaries.find((summary) => summary.blockId === 'check');
	const end = summaries.find((summary) => summary.blockId === 'end');

	assert.equal(intro?.visualState, 'completed');
	assert.equal(check?.visualState, 'current');
	assert.equal(check?.revisited, true);
	assert.equal(check?.hasAlerts, true);
	assert.equal(end?.visualState, 'pending');
});
