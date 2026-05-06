import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMoodleRestEndpoint } from './MoodleClient';

test('normalizeMoodleRestEndpoint keeps a full Moodle REST endpoint unchanged', () => {
	assert.equal(
		normalizeMoodleRestEndpoint('https://moodle.unican.es/webservice/rest/server.php'),
		'https://moodle.unican.es/webservice/rest/server.php'
	);
});

test('normalizeMoodleRestEndpoint expands a Moodle root URL to the REST endpoint', () => {
	assert.equal(
		normalizeMoodleRestEndpoint('https://moodle.unican.es'),
		'https://moodle.unican.es/webservice/rest/server.php'
	);
});

test('normalizeMoodleRestEndpoint preserves Moodle installations under a path', () => {
	assert.equal(
		normalizeMoodleRestEndpoint('https://campus.example.edu/moodle'),
		'https://campus.example.edu/moodle/webservice/rest/server.php'
	);
});

test('normalizeMoodleRestEndpoint respects explicit custom PHP endpoints', () => {
	assert.equal(
		normalizeMoodleRestEndpoint('https://campus.example.edu/custom/moodle-rest.php'),
		'https://campus.example.edu/custom/moodle-rest.php'
	);
});

test('normalizeMoodleRestEndpoint strips stale query strings from pasted endpoint URLs', () => {
	assert.equal(
		normalizeMoodleRestEndpoint(
			'https://campus.example.edu/moodle/webservice/rest/server.php?wstoken=old#fragment'
		),
		'https://campus.example.edu/moodle/webservice/rest/server.php'
	);
});
