import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentContext } from '$lib/types/agent';
import { defineBuiltinToolPackage } from './defineBuiltinToolPackage';
import { calculateExpressionPackage } from './calculateExpression';
import { calculateExpressionManifest } from './calculateExpression/manifest';

const context: AgentContext = {
	userId: 'test-user',
	chatId: 'test-chat',
	activityId: 'test-activity',
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

test('builtin boundary rejects missing or wrong arguments before invoking the handler', async () => {
	let calls = 0;
	const tool = defineBuiltinToolPackage({
		manifest: calculateExpressionManifest,
		handler: async (args: { expression: string }, receivedContext, toolCallId) => {
			calls++;
			assert.equal(receivedContext, context);
			assert.equal(toolCallId, 'call-1');
			return { success: true, data: args.expression, durationMs: 0 };
		}
	});
	for (const args of [{}, { expression: 1 }, { expression: null }]) {
		assert.equal((await tool.handler(args, context, 'call-1')).success, false);
	}
	assert.equal(calls, 0);
	assert.equal((await tool.handler({ expression: '2 + 2' }, context, 'call-1')).data, '2 + 2');
	assert.equal(calls, 1);
});

test('registered calculator still executes valid input and rejects invalid input', async () => {
	const result = await calculateExpressionPackage.handler({ expression: '2 + 2' }, context);
	assert.equal(result.success, true);
	assert.match(result.displayText ?? '', /4/);
	assert.equal((await calculateExpressionPackage.handler({}, context)).success, false);
});
