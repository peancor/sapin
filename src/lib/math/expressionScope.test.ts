import test from 'node:test';
import assert from 'node:assert/strict';

import {
	compileScopedExpression,
	EDUCATIONAL_EXPRESSION_SCOPE
} from './expressionScope.ts';

test('randInt returns integers within the inclusive range', () => {
	const evaluate = compileScopedExpression('randInt(1, 6)', {
		scope: EDUCATIONAL_EXPRESSION_SCOPE
	});

	for (let index = 0; index < 200; index += 1) {
		const result = evaluate();
		assert.equal(Number.isInteger(result), true);
		assert.ok(result >= 1 && result <= 6);
	}
});

test('randInt with equal bounds returns the same value', () => {
	const evaluate = compileScopedExpression('randInt(4, 4)', {
		scope: EDUCATIONAL_EXPRESSION_SCOPE
	});

	assert.equal(evaluate(), 4);
});

test('randInt rejects decimals and inverted ranges', () => {
	assert.throws(
		() =>
			compileScopedExpression('randInt(1.2, 5)', {
				scope: EDUCATIONAL_EXPRESSION_SCOPE
			})(),
		/randInt min must be an integer/
	);

	assert.throws(
		() =>
			compileScopedExpression('randInt(8, 3)', {
				scope: EDUCATIONAL_EXPRESSION_SCOPE
			})(),
		/randInt requires min <= max/
	);
});

test('educational integer helpers work as expected', () => {
	const evaluate = (expression: string) =>
		compileScopedExpression(expression, { scope: EDUCATIONAL_EXPRESSION_SCOPE })();

	assert.equal(evaluate('gcd(12, 18, 30)'), 6);
	assert.equal(evaluate('lcm(4, 6)'), 12);
	assert.equal(evaluate('factorial(5)'), 120);
	assert.equal(evaluate('mod(-3, 5)'), 2);
});

test('factorial rejects negative values', () => {
	assert.throws(
		() =>
			compileScopedExpression('factorial(-1)', {
				scope: EDUCATIONAL_EXPRESSION_SCOPE
			})(),
		/factorial requires a non-negative integer/
	);
});

test('angular and aggregate helpers work as expected', () => {
	const evaluate = (expression: string) =>
		compileScopedExpression(expression, { scope: EDUCATIONAL_EXPRESSION_SCOPE })();

	assert.equal(evaluate('avg(2, 4, 6)'), 4);
	assert.equal(evaluate('sum(2, 4, 6)'), 12);
	assert.equal(evaluate('deg2rad(180)'), Math.PI);
	assert.equal(evaluate('rad2deg(pi)'), 180);
});

test('unknown identifiers are rejected explicitly', () => {
	assert.throws(
		() =>
			compileScopedExpression('random()', {
				scope: EDUCATIONAL_EXPRESSION_SCOPE
			}),
		/Identifier not allowed: random/
	);

	assert.throws(
		() =>
			compileScopedExpression('foo(2)', {
				scope: EDUCATIONAL_EXPRESSION_SCOPE
			}),
		/Identifier not allowed: foo/
	);
});
