import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { radarFixture } from '$lib/server/radar/testing';
import type { AgentContext } from '$lib/types/agent';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';
import { getSessionLearningSignalsManifest } from './manifest';
import { buildSessionSignals, readSessionSignals } from './signals';

const context: AgentContext = {
	userId: 'student',
	chatId: 'chat',
	activityId: 'activity',
	courseId: 'course',
	activityConfig: {
		maxToolRoundtrips: 3,
		parallelToolCalls: false,
		toolChoice: 'auto',
		finalizationEnabled: false,
		finalizationToolName: '',
		finalizationHandler: 'mark_complete_only',
		requireFinalizationToolCall: false
	},
	enabledTools: [],
	enabledUIComponentKeys: [],
	messageHistory: []
};

test('metrics preserve zero, missing and invalid observations without leaking arbitrary metadata', () => {
	const rows = [
		null,
		'{',
		'[]',
		'{"pasteCount":0,"wordCount":4,"deviceInfo":{"userAgent":"private"}}',
		'{"pasteCount":-1,"wordCount":"8","charCount":1.5,"timeSpentSeconds":1e309}'
	].map((metadata, id) => ({
		id: String(id),
		createdAt: new Date(0),
		textContent: 'Respuesta',
		metadata
	}));
	const result = buildSessionSignals(rows, { scope: 'recent', limit: 5 });
	assert.equal(result.messageCount, 5);
	assert.equal(result.messagesWithMetrics, 1);
	assert.deepEqual(result.metrics.pasteCount, {
		total: 0,
		observedMessages: 1,
		missingMessages: 4
	});
	assert.equal(result.metrics.charCount.total, null);
	assert.equal(result.messages[4].metrics.timeSpentSeconds, null);
	assert.equal(JSON.stringify(result).includes('private'), false);
	assert.equal(buildSessionSignals([], {}).metrics.pasteCount.total, null);
});

test('session query isolates owner and activity, excludes internal/assistant messages and orders timestamp ties', async () => {
	const f = radarFixture('agent');
	try {
		f.addMessage('z-first', 'Primero');
		f.addMessage('a-latest', 'Segundo');
		f.addMessage('trigger', '[[CONTINUE]]');
		f.addMessage('assistant', 'Respuesta', f.now(), 'assistant');
		f.database
			.update(schema.agentMessage)
			.set({ metadata: '{"pasteCount":2}' })
			.where(eq(schema.agentMessage.id, 'a-latest'))
			.run();
		f.addChat('other', 'student2');
		f.addMessage('other-message', 'Privado', f.now(), 'user', 'other');
		const latest = await readSessionSignals(f.database, context, {});
		assert.deepEqual(
			latest.messages.map((m) => m.messageId),
			['a-latest']
		);
		assert.equal(latest.metrics.pasteCount.total, 2);
		const recent = await readSessionSignals(f.database, context, { scope: 'recent', limit: 2 });
		assert.deepEqual(
			recent.messages.map((m) => m.messageId),
			['z-first', 'a-latest']
		);
		const session = await readSessionSignals(f.database, context, { scope: 'session' });
		assert.equal(session.messageCount, 2);
		assert.equal(session.messagesWithMetrics, 1);
		assert.deepEqual(session.messages, []);
		for (const override of [
			{ userId: 'student2' },
			{ activityId: 'other' },
			{ chatId: 'other' },
			{ chatId: 'missing' }
		]) {
			await assert.rejects(readSessionSignals(f.database, { ...context, ...override }, {}));
		}
	} finally {
		f.client.close();
	}
});

test('builtin schema rejects invalid windows and identifiers cannot change the authorized scope', async () => {
	const f = radarFixture('agent');
	try {
		f.addMessage('own', 'Respuesta');
		const tool = defineBuiltinToolPackage({
			manifest: getSessionLearningSignalsManifest,
			handler: async (params, ctx) => ({
				success: true,
				data: await readSessionSignals(f.database, ctx, params),
				durationMs: 0
			})
		});
		for (const params of [
			{ scope: 'other' },
			{ limit: 0 },
			{ limit: 51 },
			{ limit: 1.5 },
			{ limit: '5' }
		]) {
			assert.equal((await tool.handler(params, context)).success, false);
		}
		const result = await tool.handler(
			{ chatId: 'other', userId: 'student2', activityId: 'other' },
			context
		);
		assert.equal(result.success, true);
		assert.equal(
			(result.data as ReturnType<typeof buildSessionSignals>).messages[0].messageId,
			'own'
		);
	} finally {
		f.client.close();
	}
});
