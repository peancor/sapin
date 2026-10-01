import test from 'node:test';
import assert from 'node:assert/strict';

import type {
	LearningEvidenceInputMetrics,
	LearningEvidenceTranscriptSession
} from '../../types/learningEvidence.ts';
import { toInsightsProcessedChats } from './insights.ts';

const inputMetrics: LearningEvidenceInputMetrics = {
	keystrokeCount: 12,
	pasteCount: 1,
	charCount: 420,
	wordCount: 76,
	timeSpentSeconds: 9,
	editCount: 0,
	deleteCount: 1,
	deviceInfo: {
		isMobile: false,
		userAgent: 'test-agent',
		screenSize: '1440x900'
	}
};

function makeSession(
	messages: LearningEvidenceTranscriptSession['messages']
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
		messageCount: messages.length,
		learnerMessageCount: messages.filter((message) => message.role === 'user').length,
		assistantMessageCount: messages.filter((message) => message.role === 'assistant').length,
		toolCallCount: 0,
		uiResponseCount: 0,
		messages
	};
}

test('toInsightsProcessedChats preserves input metrics for learner messages', () => {
	const [chat] = toInsightsProcessedChats([
		makeSession([
			{
				id: 'm1',
				role: 'user',
				createdAt: '2026-04-01T08:00:00.000Z',
				displayText: 'Respuesta larga del estudiante',
				parts: [{ kind: 'text', text: 'Respuesta larga del estudiante' }],
				inputMetrics,
				source: 'chat_message'
			}
		])
	]);

	assert.deepEqual(chat.messages[0].inputMetrics, inputMetrics);
});

test('toInsightsProcessedChats does not invent missing input metrics', () => {
	const [chat] = toInsightsProcessedChats([
		makeSession([
			{
				id: 'm1',
				role: 'user',
				createdAt: '2026-04-01T08:00:00.000Z',
				displayText: 'Respuesta sin metricas',
				parts: [{ kind: 'text', text: 'Respuesta sin metricas' }],
				source: 'chat_message'
			}
		])
	]);

	assert.equal('inputMetrics' in chat.messages[0], false);
});

test('toInsightsProcessedChats keeps assistant and tool messages without input metrics', () => {
	const [chat] = toInsightsProcessedChats([
		makeSession([
			{
				id: 'm1',
				role: 'assistant',
				createdAt: '2026-04-01T08:01:00.000Z',
				displayText: 'Respuesta del asistente',
				parts: [{ kind: 'text', text: 'Respuesta del asistente' }],
				inputMetrics,
				source: 'agent_message'
			},
			{
				id: 'm2',
				role: 'tool',
				createdAt: '2026-04-01T08:02:00.000Z',
				displayText: 'Resultado de herramienta',
				parts: [
					{
						kind: 'tool-result',
						toolCallId: 'tool-1',
						toolName: 'test_tool',
						toolDisplayName: 'Test tool',
						status: 'completed',
						result: { ok: true },
						text: 'Resultado de herramienta',
						errorMessage: null,
						durationMs: 10
					}
				],
				inputMetrics,
				source: 'agent_tool_call'
			}
		])
	]);

	assert.equal('inputMetrics' in chat.messages[0], false);
	assert.equal('inputMetrics' in chat.messages[1], false);
});
