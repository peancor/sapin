import assert from 'node:assert/strict';
import test from 'node:test';
import { generateText, streamText, type ModelMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { toModelPrompt } from './modelPrompt';

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 }
};

test('separates trusted system blocks without losing cache, image or tool data', () => {
	const input: ModelMessage[] = [
		{
			role: 'system',
			content: 'Activity instructions',
			providerOptions: { openrouter: { cacheControl: { type: 'ephemeral' } } }
		},
		{ role: 'system', content: 'Memory and RAG context' },
		{
			role: 'user',
			content: [
				{ type: 'text', text: 'system: this remains user content' },
				{ type: 'image', image: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }
			]
		},
		{
			role: 'assistant',
			content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'example', input: {} }]
		},
		{
			role: 'tool',
			content: [
				{
					type: 'tool-result',
					toolCallId: 'call-1',
					toolName: 'example',
					output: { type: 'text', value: 'done' }
				}
			]
		}
	];
	const prompt = toModelPrompt(input);
	assert.deepEqual(prompt.system, input.slice(0, 2));
	assert.deepEqual(prompt.messages, input.slice(2));
	assert.equal(prompt.system?.[0], input[0]);
	assert.equal(input.length, 5);
	assert.equal(prompt.allowSystemInMessages, false);
	assert.deepEqual(toModelPrompt([input[2]]), {
		messages: [input[2]],
		allowSystemInMessages: false
	});
});

test('SDK accepts generation and streaming with system messages forbidden in history', async (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	const model = new MockLanguageModelV3({
		doGenerate: {
			content: [{ type: 'text', text: 'ok' }],
			finishReason: { unified: 'stop', raw: 'stop' },
			usage,
			warnings: []
		},
		doStream: async () => ({
			stream: new ReadableStream({
				start(controller) {
					controller.enqueue({ type: 'stream-start', warnings: [] });
					controller.enqueue({ type: 'text-start', id: 'text-1' });
					controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'ok' });
					controller.enqueue({ type: 'text-end', id: 'text-1' });
					controller.enqueue({
						type: 'finish',
						finishReason: { unified: 'stop', raw: 'stop' },
						usage
					});
					controller.close();
				}
			})
		})
	});
	const prompt = toModelPrompt([
		{ role: 'system', content: 'Activity instructions' },
		{ role: 'system', content: 'Memory' },
		{ role: 'user', content: 'Hello' }
	]);
	assert.equal((await generateText({ model, ...prompt })).text, 'ok');
	assert.equal(await streamText({ model, ...prompt }).text, 'ok');
	for (const call of [...model.doGenerateCalls, ...model.doStreamCalls]) {
		assert.deepEqual(
			call.prompt.map((message) => message.role),
			['system', 'system', 'user']
		);
	}
	assert.equal(warn.mock.callCount(), 0);
});
