export type ExpressionScopeFunction = (...args: number[]) => number;
export type ExpressionScopeValue = number | ExpressionScopeFunction;
export type ExpressionScope = Record<string, ExpressionScopeValue>;

const VALID_CHARACTERS = /[^0-9+\-*/().,%^ a-zA-Z_]/g;
const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;

function assertFiniteNumber(name: string, value: number): void {
	if (!Number.isFinite(value)) {
		throw new Error(`${name} must be a finite number`);
	}
}

function assertInteger(name: string, value: number): void {
	assertFiniteNumber(name, value);
	if (!Number.isInteger(value)) {
		throw new Error(`${name} must be an integer`);
	}
}

function assertMinArgs(functionName: string, args: number[], minCount: number): void {
	if (args.length < minCount) {
		throw new Error(`${functionName} expects at least ${minCount} arguments`);
	}
}

function assertExactArgs(functionName: string, args: number[], expectedCount: number): void {
	if (args.length !== expectedCount) {
		throw new Error(`${functionName} expects exactly ${expectedCount} arguments`);
	}
}

function gcdPair(left: number, right: number): number {
	let a = Math.abs(left);
	let b = Math.abs(right);

	while (b !== 0) {
		const remainder = a % b;
		a = b;
		b = remainder;
	}

	return a;
}

function lcmPair(left: number, right: number): number {
	if (left === 0 || right === 0) {
		return 0;
	}

	return Math.abs(left * right) / gcdPair(left, right);
}

const randInt: ExpressionScopeFunction = (...args) => {
	assertExactArgs('randInt', args, 2);
	const [min, max] = args;
	assertInteger('randInt min', min);
	assertInteger('randInt max', max);

	if (min > max) {
		throw new Error('randInt requires min <= max');
	}

	if (min === max) {
		return min;
	}

	return Math.floor(Math.random() * (max - min + 1)) + min;
};

const mod: ExpressionScopeFunction = (...args) => {
	assertExactArgs('mod', args, 2);
	const [value, modulus] = args;
	assertInteger('mod value', value);
	assertInteger('mod modulus', modulus);

	if (modulus === 0) {
		throw new Error('mod modulus must not be zero');
	}

	const normalizedModulus = Math.abs(modulus);
	return ((value % normalizedModulus) + normalizedModulus) % normalizedModulus;
};

const clamp: ExpressionScopeFunction = (...args) => {
	assertExactArgs('clamp', args, 3);
	const [value, min, max] = args;
	assertFiniteNumber('clamp value', value);
	assertFiniteNumber('clamp min', min);
	assertFiniteNumber('clamp max', max);

	if (min > max) {
		throw new Error('clamp requires min <= max');
	}

	return Math.min(Math.max(value, min), max);
};

const gcd: ExpressionScopeFunction = (...args) => {
	assertMinArgs('gcd', args, 2);
	for (const [index, value] of args.entries()) {
		assertInteger(`gcd argument ${index + 1}`, value);
	}

	return args.reduce((accumulator, value) => gcdPair(accumulator, value));
};

const lcm: ExpressionScopeFunction = (...args) => {
	assertMinArgs('lcm', args, 2);
	for (const [index, value] of args.entries()) {
		assertInteger(`lcm argument ${index + 1}`, value);
	}

	return args.reduce((accumulator, value) => lcmPair(accumulator, value));
};

const factorial: ExpressionScopeFunction = (...args) => {
	assertExactArgs('factorial', args, 1);
	const [value] = args;
	assertInteger('factorial n', value);

	if (value < 0) {
		throw new Error('factorial requires a non-negative integer');
	}

	if (value > 170) {
		throw new Error('factorial result is too large');
	}

	let result = 1;
	for (let current = 2; current <= value; current += 1) {
		result *= current;
	}

	return result;
};

const deg2rad: ExpressionScopeFunction = (...args) => {
	assertExactArgs('deg2rad', args, 1);
	const [degrees] = args;
	assertFiniteNumber('deg2rad degrees', degrees);
	return (degrees * Math.PI) / 180;
};

const rad2deg: ExpressionScopeFunction = (...args) => {
	assertExactArgs('rad2deg', args, 1);
	const [radians] = args;
	assertFiniteNumber('rad2deg radians', radians);
	return (radians * 180) / Math.PI;
};

const sum: ExpressionScopeFunction = (...args) => {
	assertMinArgs('sum', args, 1);
	for (const [index, value] of args.entries()) {
		assertFiniteNumber(`sum argument ${index + 1}`, value);
	}

	return args.reduce((accumulator, value) => accumulator + value, 0);
};

const avg: ExpressionScopeFunction = (...args) => {
	assertMinArgs('avg', args, 1);
	return sum(...args) / args.length;
};

export const BASE_ALLOWED_FUNCTIONS: Record<string, ExpressionScopeFunction> = {
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

export const BASE_ALLOWED_CONSTANTS: Record<string, number> = {
	pi: Math.PI,
	PI: Math.PI,
	e: Math.E,
	E: Math.E,
	phi: 1.618033988749895,
	tau: 2 * Math.PI
};

export const EDUCATIONAL_ALLOWED_FUNCTIONS: Record<string, ExpressionScopeFunction> = {
	...BASE_ALLOWED_FUNCTIONS,
	randInt,
	mod,
	clamp,
	gcd,
	lcm,
	factorial,
	deg2rad,
	rad2deg,
	sum,
	avg
};

export const BASE_EXPRESSION_SCOPE: ExpressionScope = {
	...BASE_ALLOWED_CONSTANTS,
	...BASE_ALLOWED_FUNCTIONS
};

export const EDUCATIONAL_EXPRESSION_SCOPE: ExpressionScope = {
	...BASE_ALLOWED_CONSTANTS,
	...EDUCATIONAL_ALLOWED_FUNCTIONS
};

export function sanitizeExpression(rawExpression: string): string {
	return rawExpression.replace(VALID_CHARACTERS, '').trim();
}

export function validateIdentifiers(
	expression: string,
	allowedIdentifiers: Iterable<string>
): void {
	const allowed = new Set(allowedIdentifiers);
	const tokens = expression.match(IDENTIFIER_PATTERN) ?? [];

	for (const token of tokens) {
		if (!allowed.has(token)) {
			throw new Error(`Identifier not allowed: ${token}`);
		}
	}
}

export function normalizeExpression(expression: string): string {
	return expression.replace(/\^/g, '**');
}

export function compileScopedExpression(
	expression: string,
	options?: {
		scope?: ExpressionScope;
		argNames?: string[];
	}
): (...args: number[]) => number {
	const sanitized = sanitizeExpression(expression);
	if (!sanitized) {
		throw new Error('Expression is empty or invalid');
	}

	const scope = options?.scope ?? {};
	const argNames = options?.argNames ?? [];
	validateIdentifiers(sanitized, [...argNames, ...Object.keys(scope)]);

	const normalizedExpression = normalizeExpression(sanitized);
	const scopeKeys = Object.keys(scope);
	const scopeValues = Object.values(scope);

	const evaluator = new Function(
		...argNames,
		...scopeKeys,
		`"use strict"; return (${normalizedExpression});`
	);

	return (...argValues: number[]): number => {
		if (argValues.length !== argNames.length) {
			throw new Error(
				`Expression expects ${argNames.length} runtime arguments, received ${argValues.length}`
			);
		}

		const result = evaluator(...argValues, ...scopeValues) as unknown;
		if (typeof result !== 'number' || !Number.isFinite(result)) {
			throw new Error(`Expression produced a non-finite result: ${String(result)}`);
		}

		return result;
	};
}

export function evaluateScopedExpression(
	expression: string,
	scope: ExpressionScope = EDUCATIONAL_EXPRESSION_SCOPE
): number {
	return compileScopedExpression(expression, { scope })();
}
