import test from 'node:test';
import assert from 'node:assert/strict';

import {
	resolveExternalIdSearchParam,
	resolveExternalIdSearchParamDetail
} from './externalIdSearchParam.ts';

test('resolveExternalIdSearchParam prefers the Moodle-friendly id parameter', () => {
	const params = new URLSearchParams({
		id: 'moodle-id',
		externalId: 'legacy-camel',
		externalid: 'legacy-lower'
	});

	assert.equal(resolveExternalIdSearchParam(params), 'moodle-id');
	assert.deepEqual(resolveExternalIdSearchParamDetail(params), {
		name: 'id',
		value: 'moodle-id'
	});
});

test('resolveExternalIdSearchParam accepts legacy externalId parameters', () => {
	assert.equal(
		resolveExternalIdSearchParam(new URLSearchParams({ externalId: 'legacy-camel' })),
		'legacy-camel'
	);
	assert.equal(
		resolveExternalIdSearchParam(new URLSearchParams({ externalid: 'legacy-lower' })),
		'legacy-lower'
	);
});

test('resolveExternalIdSearchParam ignores empty parameters while preserving priority', () => {
	assert.equal(
		resolveExternalIdSearchParam(new URLSearchParams('id=&externalId=legacy-camel')),
		'legacy-camel'
	);
	assert.deepEqual(
		resolveExternalIdSearchParamDetail(new URLSearchParams('id=&externalId=legacy-camel')),
		{
			name: 'externalId',
			value: 'legacy-camel'
		}
	);
});

test('resolveExternalIdSearchParam returns null when no supported parameter exists', () => {
	assert.equal(resolveExternalIdSearchParam(new URLSearchParams({ user: '123' })), null);
	assert.equal(resolveExternalIdSearchParamDetail(new URLSearchParams({ user: '123' })), null);
});
