const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
	sqrt: Math.sqrt,
	cbrt: Math.cbrt,
	abs: Math.abs,
	ceil: Math.ceil,
	floor: Math.floor,
	round: Math.round,
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	atan2: Math.atan2,
	log: Math.log,
	log2: Math.log2,
	log10: Math.log10,
	exp: Math.exp,
	pow: Math.pow,
	max: Math.max,
	min: Math.min,
	sign: Math.sign,
	trunc: Math.trunc
};

const ALLOWED_CONSTANTS: Record<string, number> = {
	pi: Math.PI,
	PI: Math.PI,
	e: Math.E,
	E: Math.E,
	tau: 2 * Math.PI,
	phi: 1.618033988749895
};

const ALLOWED_IDENTIFIERS = new Set([
	'x',
	'X',
	...Object.keys(ALLOWED_FUNCTIONS),
	...Object.keys(ALLOWED_CONSTANTS)
]);

const VALID_CHARACTERS = /[^0-9+\-*/().,%^ a-zA-Z_]/g;
const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;

function sanitizeExpression(rawExpression: string): string {
	return rawExpression.replace(VALID_CHARACTERS, '').trim();
}

function validateIdentifiers(expression: string): void {
	const tokens = expression.match(IDENTIFIER_PATTERN) ?? [];

	for (const token of tokens) {
		if (!ALLOWED_IDENTIFIERS.has(token)) {
			throw new Error(`Identifier not allowed: ${token}`);
		}
	}
}

export function compileFormulaExpression(expression: string): (x: number) => number {
	const sanitized = sanitizeExpression(expression);
	if (!sanitized) {
		throw new Error('Expression is empty or invalid');
	}

	validateIdentifiers(sanitized);

	const normalizedExpression = sanitized.replace(/\^/g, '**');

	const scope = {
		...ALLOWED_CONSTANTS,
		...ALLOWED_FUNCTIONS
	};

	const scopeKeys = Object.keys(scope);
	const scopeValues = Object.values(scope);

	const fn = new Function('x', ...scopeKeys, `"use strict"; return (${normalizedExpression});`);

	return (x: number): number => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = fn(x, ...scopeValues) as any;
		if (typeof result !== 'number' || !isFinite(result)) {
			throw new Error('Expression produced a non-finite result');
		}
		return result;
	};
}
