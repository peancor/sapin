import test from 'node:test';
import assert from 'node:assert/strict';

import { modelCapabilitiesSupportVision, parseModelCapabilities } from './modelCapabilities.ts';

test('modelCapabilitiesSupportVision detects only the canonical vision capability', () => {
	assert.equal(modelCapabilitiesSupportVision(JSON.stringify(['text', 'vision'])), true);
	assert.equal(modelCapabilitiesSupportVision(JSON.stringify(['text', 'image'])), false);
	assert.equal(modelCapabilitiesSupportVision(JSON.stringify(['text'])), false);
	assert.equal(modelCapabilitiesSupportVision(null), false);
});

test('parseModelCapabilities tolerates malformed capability payloads', () => {
	assert.deepEqual(parseModelCapabilities('not-json'), []);
	assert.deepEqual(parseModelCapabilities(JSON.stringify({ vision: true })), []);
	assert.deepEqual(parseModelCapabilities(JSON.stringify(['text', 1, 'vision'])), [
		'text',
		'vision'
	]);
});
