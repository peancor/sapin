import assert from 'node:assert/strict';
import test from 'node:test';
import { ragDocumentLink } from './ragDocumentLink';

test('RAG file endpoints retain encoded identifiers, query strings and fragments', () => {
	for (const pathname of ['/api/files/document-123', '/api/files/a%20b?download=1#page=2']) {
		assert.deepEqual(ragDocumentLink(pathname), { kind: 'internal', pathname });
	}
});

test('external and legacy resource URLs are preserved without adding an application prefix', () => {
	for (const href of [
		'https://example.invalid/api/files/document?token=a%2Bb#page=3',
		'http://example.invalid/document.pdf',
		'//example.invalid/document.pdf',
		'/sapin/api/files/document',
		'/uploads/legacy.pdf',
		'../materials/legacy.pdf'
	]) {
		assert.deepEqual(ragDocumentLink(href), { kind: 'resource', href });
	}
});

test('missing and non-web executable references are not exposed as document links', () => {
	for (const value of [
		null,
		undefined,
		'',
		'  ',
		'javascript:alert(1)',
		'data:text/html,test',
		'file:///C:/test.pdf',
		'java\nscript:alert(1)'
	]) {
		assert.equal(ragDocumentLink(value), null);
	}
});
