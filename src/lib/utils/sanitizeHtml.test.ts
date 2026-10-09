import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml } from './sanitizeHtml';
import { renderMarkdownMath } from './markdownMath';

test('HTML sanitization removes scripts, event handlers and executable links', () => {
	const clean = sanitizeHtml(
		'<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a><iframe srcdoc="<script>alert(1)</script>"></iframe><svg onload="alert(1)"></svg>'
	);
	assert.doesNotMatch(clean, /<script|onerror|onload|javascript:|<iframe|srcdoc/i);
	assert.match(clean, />link<\/a>/);
});

test('HTML sanitization preserves Markdown, safe links, tables and KaTeX MathML', () => {
	const clean = sanitizeHtml(
		renderMarkdownMath(
			'**Bold** [link](https://example.com)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n$x^2 + 1$'
		)
	);
	assert.match(clean, /<strong>Bold<\/strong>/);
	assert.match(clean, /href="https:\/\/example.com"/);
	assert.match(clean, /<table>/);
	assert.match(clean, /class="katex"/);
	assert.match(clean, /<math/);
	assert.match(clean, /<msup>/);
});

test('HTML sanitization blocks encoded URLs, embedded forms and DOM clobbering', () => {
	const clean = sanitizeHtml(
		'<a href="java&#x73;cript:alert(1)">bad</a><form id="location"><input name="cookie"></form><p id="location">text</p><style>body{display:none}</style>'
	);
	assert.doesNotMatch(clean, /javascript:|<form|<input|<style|id="location"/i);
	assert.match(clean, /text/);
});

test('HTML sanitization preserves safe internal anchors', () => {
	const clean = sanitizeHtml('<h2 id="section-1">Section</h2><a href="#section-1">Go</a>');
	assert.match(clean, /id="section-1"/);
	assert.match(clean, /href="#section-1"/);
});
