import { BASE_EXPRESSION_SCOPE, compileScopedExpression } from '$lib/math/expressionScope';

export function compileFormulaExpression(expression: string): (x: number) => number {
	const evaluate = compileScopedExpression(expression, {
		scope: BASE_EXPRESSION_SCOPE,
		argNames: ['x', 'X']
	});

	return (x: number): number => {
		return evaluate(x, x);
	};
}
