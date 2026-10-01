import type { LessonConditionOperator } from '$lib/types/lesson';

function parseBooleanLike(value: unknown): boolean | null {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') {
		if (value === 1) return true;
		if (value === 0) return false;
		return null;
	}
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true' || normalized === '1') return true;
		if (normalized === 'false' || normalized === '0') return false;
	}
	return null;
}

function valuesAreEqual(left: unknown, right: unknown): boolean {
	if (typeof left === 'boolean' || typeof right === 'boolean') {
		const leftBoolean = parseBooleanLike(left);
		const rightBoolean = parseBooleanLike(right);
		if (leftBoolean !== null && rightBoolean !== null) {
			return leftBoolean === rightBoolean;
		}
	}

	return left === right;
}

export function evaluateLessonCondition(
	operator: LessonConditionOperator,
	left: unknown,
	right: unknown
): boolean {
	if (operator === 'equals') return valuesAreEqual(left, right);
	if (operator === 'not_equals') return !valuesAreEqual(left, right);
	if (operator === 'contains') return String(left ?? '').includes(String(right ?? ''));
	if (operator === 'exists') return left !== undefined && left !== null && String(left) !== '';
	if (operator === 'not_exists') return left === undefined || left === null || String(left) === '';
	if (operator === 'gt') return Number(left) > Number(right);
	if (operator === 'gte') return Number(left) >= Number(right);
	if (operator === 'lt') return Number(left) < Number(right);
	if (operator === 'lte') return Number(left) <= Number(right);
	return false;
}
