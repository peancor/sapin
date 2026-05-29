import test from 'node:test';
import assert from 'node:assert/strict';

import { preprocessMathExpressions } from './mathPreprocessor.ts';
import { renderMarkdownMath } from './markdownMath.ts';

test('keeps display math delimiters on their own lines', () => {
	const processed = preprocessMathExpressions(`Sistema:

$$
\\begin{cases}
x - y = 3 \\\\
2x + y = 3
\\end{cases}
$$`);

	assert.match(processed, /\$\$\n\\begin\{cases\}/);
	assert.match(processed, /\\end\{cases\}\n\$\$/);
});

test('normalizes bracket display math to standard display delimiters', () => {
	const processed = preprocessMathExpressions('\\[x + y = 1\\]');

	assert.equal(processed.trim(), '$$\nx + y = 1\n$$');
});

test('normalizes single row separators emitted inside cases environments', () => {
	const processed = preprocessMathExpressions(`$$
\\begin{cases}
x - y = 3 \\
2x + y = 3
\\end{cases}
$$`);

	assert.match(processed, /x - y = 3 \\\\\n2x \+ y = 3/);
});

test('renders display cases as KaTeX html', () => {
	const html = renderMarkdownMath(`$$
\\begin{cases}
x - y = 3 \\\\
2x + y = 3
\\end{cases}
$$`);

	assert.match(html, /katex-display/);
	assert.doesNotMatch(html, /\$\$/);
});
