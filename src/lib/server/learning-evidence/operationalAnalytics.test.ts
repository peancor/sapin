import test from 'node:test';
import assert from 'node:assert/strict';

import type { LearningEvidenceTranscriptSession } from '../../types/learningEvidence.ts';
import {
	analyzeToolFrictionHotspotsFromTranscripts,
	buildDropoutFunnel,
	detectMisconceptionClustersFromTranscripts,
	measureResponseDepthFromTranscripts
} from './operationalAnalytics.ts';

function makeSession(
	overrides: Partial<LearningEvidenceTranscriptSession>
): LearningEvidenceTranscriptSession {
	return {
		student: {
			userId: 'student-1',
			username: 'student1',
			email: 'student1@example.com'
		},
		chatId: 'chat-1',
		sessionStartedAt: '2026-04-01T08:00:00.000Z',
		sessionUpdatedAt: '2026-04-01T08:10:00.000Z',
		messageCount: 2,
		learnerMessageCount: 1,
		assistantMessageCount: 1,
		toolCallCount: 0,
		uiResponseCount: 0,
		messages: [
			{
				id: 'm1',
				role: 'user',
				createdAt: '2026-04-01T08:00:00.000Z',
				displayText: 'Necesito ayuda para entender el concepto.',
				parts: [{ kind: 'text', text: 'Necesito ayuda para entender el concepto.' }],
				source: 'chat_message'
			},
			{
				id: 'm2',
				role: 'assistant',
				createdAt: '2026-04-01T08:01:00.000Z',
				displayText: 'Vamos paso a paso.',
				parts: [{ kind: 'text', text: 'Vamos paso a paso.' }],
				source: 'agent_message'
			}
		],
		...overrides
	};
}

test('buildDropoutFunnel derives stage counts and averages', () => {
	const funnel = buildDropoutFunnel(
		[
			{
				userId: 's1',
				username: 'a',
				email: 'a@example.com',
				progressStatus: 'completed',
				sessionCount: 2,
				totalMessages: 4,
				learnerMessageCount: 2,
				assistantMessageCount: 2,
				toolCallCount: 0,
				uiResponseCount: 0,
				averageLearnerMessageLength: 80,
				startedAt: '2026-04-02T08:00:00.000Z',
				firstActivityAt: '2026-04-02T08:00:00.000Z',
				lastActivityAt: '2026-04-03T08:00:00.000Z',
				completedAt: '2026-04-03T08:00:00.000Z',
				attemptsCount: 2,
				timeSpentSeconds: 300
			},
			{
				userId: 's2',
				username: 'b',
				email: 'b@example.com',
				progressStatus: 'abandoned',
				sessionCount: 1,
				totalMessages: 2,
				learnerMessageCount: 1,
				assistantMessageCount: 1,
				toolCallCount: 0,
				uiResponseCount: 0,
				averageLearnerMessageLength: 30,
				startedAt: '2026-04-04T08:00:00.000Z',
				firstActivityAt: '2026-04-04T08:00:00.000Z',
				lastActivityAt: '2026-04-06T08:00:00.000Z',
				completedAt: null,
				attemptsCount: 1,
				timeSpentSeconds: 120
			},
			{
				userId: 's3',
				username: 'c',
				email: 'c@example.com',
				progressStatus: 'not_started',
				sessionCount: 0,
				totalMessages: 0,
				learnerMessageCount: 0,
				assistantMessageCount: 0,
				toolCallCount: 0,
				uiResponseCount: 0,
				averageLearnerMessageLength: 0,
				startedAt: null,
				firstActivityAt: null,
				lastActivityAt: null,
				completedAt: null,
				attemptsCount: 0,
				timeSpentSeconds: 0
			}
		],
		'2026-04-01T00:00:00.000Z'
	);

	assert.equal(funnel.stages.find((stage) => stage.key === 'enrolled')?.count, 3);
	assert.equal(funnel.stages.find((stage) => stage.key === 'started')?.count, 2);
	assert.equal(funnel.stages.find((stage) => stage.key === 'completed')?.count, 1);
	assert.equal(funnel.stages.find((stage) => stage.key === 'abandoned')?.count, 1);
	assert.equal(funnel.averages.daysToStart, 2);
	assert.equal(funnel.averages.daysToAbandon, 2);
});

test('analyzeToolFrictionHotspotsFromTranscripts highlights failing tools', () => {
	const transcripts: LearningEvidenceTranscriptSession[] = [
		makeSession({
			chatId: 'chat-fail',
			toolCallCount: 1,
			messages: [
				{
					id: 'm1',
					role: 'user',
					createdAt: '2026-04-01T08:00:00.000Z',
					displayText: 'No entiendo por que falla este paso',
					parts: [{ kind: 'text', text: 'No entiendo por que falla este paso' }],
					source: 'chat_message'
				},
				{
					id: 'm2',
					role: 'assistant',
					createdAt: '2026-04-01T08:01:00.000Z',
					displayText: 'Voy a probar una herramienta.',
					parts: [
						{
							kind: 'tool-call',
							toolCallId: 'tc-1',
							toolName: 'solver',
							toolDisplayName: 'Solver',
							args: {},
							status: 'executing',
							requiresConfirmation: false
						},
						{
							kind: 'tool-result',
							toolCallId: 'tc-1',
							toolName: 'solver',
							toolDisplayName: 'Solver',
							status: 'failed',
							result: null,
							text: null,
							errorMessage: 'boom',
							durationMs: 320
						}
					],
					source: 'agent_message'
				}
			]
		})
	];

	const result = analyzeToolFrictionHotspotsFromTranscripts(transcripts);

	assert.equal(result.items.length, 1);
	assert.equal(result.items[0]?.key, 'solver');
	assert.equal(result.items[0]?.failedUses, 1);
	assert.ok((result.items[0]?.frictionScore ?? 0) > 0);
});

test('measureResponseDepthFromTranscripts differentiates shallow and deep responses', () => {
	const transcripts: LearningEvidenceTranscriptSession[] = [
		makeSession({
			student: { userId: 'deep', username: 'deep', email: 'deep@example.com' },
			chatId: 'chat-deep',
			messages: [
				{
					id: 'm1',
					role: 'user',
					createdAt: '2026-04-01T08:00:00.000Z',
					displayText:
						'Creo que la respuesta correcta es esta porque el ejemplo anterior muestra la misma estructura y, por ejemplo, cambia el signo al distribuir. En realidad, quiero decir que primero justifico el signo y despues comparo con otro caso similar para validar el procedimiento.',
					parts: [
						{
							kind: 'text',
							text: 'Creo que la respuesta correcta es esta porque el ejemplo anterior muestra la misma estructura y, por ejemplo, cambia el signo al distribuir. En realidad, quiero decir que primero justifico el signo y despues comparo con otro caso similar para validar el procedimiento.'
						}
					],
					source: 'chat_message'
				}
			],
			messageCount: 1,
			learnerMessageCount: 1,
			assistantMessageCount: 0
		}),
		makeSession({
			student: { userId: 'shallow', username: 'shallow', email: 'shallow@example.com' },
			chatId: 'chat-shallow',
			messages: [
				{
					id: 'm1',
					role: 'user',
					createdAt: '2026-04-01T08:00:00.000Z',
					displayText: 'Es esto.',
					parts: [{ kind: 'text', text: 'Es esto.' }],
					source: 'chat_message'
				}
			],
			messageCount: 1,
			learnerMessageCount: 1,
			assistantMessageCount: 0
		})
	];

	const result = measureResponseDepthFromTranscripts(transcripts);
	const deep = result.find((item) => item.studentId === 'deep');
	const shallow = result.find((item) => item.studentId === 'shallow');

	assert.ok((deep?.depthScore ?? 0) > (shallow?.depthScore ?? 0));
	assert.equal(deep?.depthBand, 'deep');
	assert.equal(shallow?.depthBand, 'shallow');
});

test('detectMisconceptionClustersFromTranscripts groups repeated confusion', () => {
	const transcripts: LearningEvidenceTranscriptSession[] = [
		makeSession({
			student: { userId: 's1', username: 's1', email: 's1@example.com' },
			chatId: 'chat-1',
			messages: [
				{
					id: 'm1',
					role: 'user',
					createdAt: '2026-04-01T08:00:00.000Z',
					displayText: 'No entiendo por que cambia el signo cuando multiplico por negativo.',
					parts: [{ kind: 'text', text: 'No entiendo por que cambia el signo cuando multiplico por negativo.' }],
					source: 'chat_message'
				}
			],
			messageCount: 1,
			learnerMessageCount: 1,
			assistantMessageCount: 0
		}),
		makeSession({
			student: { userId: 's2', username: 's2', email: 's2@example.com' },
			chatId: 'chat-2',
			messages: [
				{
					id: 'm1',
					role: 'user',
					createdAt: '2026-04-01T08:05:00.000Z',
					displayText: 'No entiendo por que cambia el signo cuando multiplico por negativo y creo que no deberia pasar.',
					parts: [
						{
							kind: 'text',
							text: 'No entiendo por que cambia el signo cuando multiplico por negativo y creo que no deberia pasar.'
						}
					],
					source: 'chat_message'
				}
			],
			messageCount: 1,
			learnerMessageCount: 1,
			assistantMessageCount: 0
		})
	];

	const result = detectMisconceptionClustersFromTranscripts(transcripts, 5);

	assert.equal(result.length, 1);
	assert.ok((result[0]?.affectedStudents ?? 0) >= 2);
});
