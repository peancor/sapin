import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderTranscriptParts } from './orderTranscriptParts';
import type { AgentDisplayPart } from '$lib/types/agent';
test('reconstructs interleaved text and interfaces, including adjacent components', () => {
	const ui = (id: string): AgentDisplayPart => ({
		kind: 'ui-component',
		instanceId: id,
		componentKey: 'QuizCard',
		interactive: false,
		props: {}
	});
	const parts: AgentDisplayPart[] = [{ kind: 'text', content: 'antesdespués' }, ui('b'), ui('a')];
	assert.deepEqual(
		orderTranscriptParts(parts, [
			{ instanceId: 'a', offset: 5 },
			{ instanceId: 'b', offset: 5 }
		]),
		[{ kind: 'text', content: 'antes' }, parts[2], parts[1], { kind: 'text', content: 'después' }]
	);
	assert.deepEqual(orderTranscriptParts(parts, undefined), parts);
	assert.deepEqual(orderTranscriptParts(parts, [{ instanceId: 'a', offset: 99 }]), parts);
});
