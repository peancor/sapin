import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentDisplayPart } from '$lib/types/agent';
import {
	addToolCall,
	addToolInterface,
	confirmedToolCall,
	toolActivity,
	type ToolCall
} from './agentToolActivity';

const call = (id: string, status = 'completed', name = 'search'): ToolCall => ({
	kind: 'tool-call',
	toolCallId: id,
	toolName: name,
	toolDisplayName: name,
	args: {},
	status
});

test('confirmation uses the server outcome, including failed executions after approval', () => {
	assert.equal(
		confirmedToolCall(call('a'), { status: 'failed', result: { error: 'Failed' } }).status,
		'failed'
	);
	assert.equal(confirmedToolCall(call('a'), { status: 'completed' }).status, 'completed');
	assert.equal(
		confirmedToolCall(call('a'), { result: { error: 'Legacy failure' } }).status,
		'failed'
	);
	assert.equal(confirmedToolCall(call('a'), {}).status, 'interrupted');
});

test('counts individual calls and groups only consecutive successes', () => {
	const result = toolActivity(
		[
			call('a'),
			call('b'),
			call('c', 'completed', 'other'),
			call('d'),
			call('e', 'failed'),
			call('f', 'failed')
		],
		false
	);
	assert.equal(result.calls.length, 6);
	assert.deepEqual(
		result.groups.map((g) => g.items.length),
		[2, 1, 1, 1, 1]
	);
	assert.equal(result.failed, 2);
});

test('unconfirmed outcomes never become success or spin after disconnection', () => {
	const parts = [
		call('a', 'executing'),
		call('b', 'unknown'),
		call('c', 'awaiting_confirmation'),
		call('d', 'rejected')
	];
	assert.equal(toolActivity(parts, true).active.length, 1);
	assert.deepEqual(
		toolActivity(parts, false).calls.map((x) => x.state),
		['interrupted', 'interrupted', 'awaiting_confirmation', 'rejected']
	);
});

test('links parallel interfaces by identity, deduplicates events, and preserves terminal results', () => {
	const parts: AgentDisplayPart[] = [call('a', 'executing'), call('b', 'executing')];
	const ui: Extract<AgentDisplayPart, { kind: 'ui-component' }> = {
		kind: 'ui-component',
		toolCallId: 'b',
		instanceId: 'quiz',
		componentKey: 'QuizCard',
		props: {},
		interactive: true
	};
	addToolInterface(parts, ui);
	addToolInterface(parts, ui);
	assert.equal(parts.length, 3);
	assert.equal((parts[1] as ToolCall).status, 'awaiting_ui_response');
	assert.deepEqual(
		toolActivity(parts, true).calls.map((x) => x.call.toolCallId),
		['a']
	);
	addToolCall(parts, call('a', 'executing'));
	assert.equal(parts.length, 3);
	const completed = [call('done')];
	addToolCall(completed, call('done', 'executing'));
	assert.equal(completed[0].status, 'completed');
});

test('legacy rendered results require a matching interface, and failures stay visible', () => {
	const rendered = { ...call('a'), result: { rendered: true, instanceId: 'quiz' } };
	assert.equal(toolActivity([rendered], false).calls.length, 1);
	const ui: AgentDisplayPart = {
		kind: 'ui-component',
		instanceId: 'quiz',
		componentKey: 'QuizCard',
		props: {},
		interactive: false
	};
	assert.equal(toolActivity([rendered, ui], false).calls.length, 0);
	assert.equal(toolActivity([{ ...rendered, status: 'failed' }, ui], false).failed, 1);
	assert.equal(toolActivity([call('a'), ui], false).calls.length, 1);
});
