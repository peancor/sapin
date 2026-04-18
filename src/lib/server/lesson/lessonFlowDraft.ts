import { lessonBlockKinds, type LessonDefinition } from '../../types/lesson.ts';
import { LessonServiceError } from './LessonServiceError.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isLessonBlockKind(value: unknown): value is (typeof lessonBlockKinds)[number] {
	return typeof value === 'string' && lessonBlockKinds.some((kind) => kind === value);
}

function isTransitionDraft(value: unknown): boolean {
	return isRecord(value) && typeof value.targetBlockId === 'string';
}

function isChoiceOptionDraft(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.label === 'string' &&
		typeof value.value === 'string' &&
		typeof value.targetBlockId === 'string'
	);
}

export function parseLessonFlowDraft(content: string): LessonDefinition {
	let parsed: unknown;

	try {
		parsed = JSON.parse(content);
	} catch {
		throw new LessonServiceError(400, 'La definición de la lesson no es un JSON válido.');
	}

	if (!isRecord(parsed) || typeof parsed.entryBlockId !== 'string' || !Array.isArray(parsed.blocks)) {
		throw new LessonServiceError(400, 'La definición actual del grafo no tiene la forma esperada.');
	}

	for (const block of parsed.blocks) {
		if (
			!isRecord(block) ||
			typeof block.id !== 'string' ||
			typeof block.kind !== 'string' ||
			typeof block.title !== 'string' ||
			!isLessonBlockKind(block.kind)
		) {
			throw new LessonServiceError(400, 'La definición actual del grafo no tiene la forma esperada.');
		}

		if (
			'next' in block &&
			typeof block.next !== 'string' &&
			block.next !== null &&
			block.next !== undefined
		) {
			throw new LessonServiceError(400, 'La definición actual del grafo no tiene transiciones válidas.');
		}

		if (
			'branches' in block &&
			block.branches !== undefined &&
			(!Array.isArray(block.branches) || !block.branches.every(isTransitionDraft))
		) {
			throw new LessonServiceError(400, 'La definición actual del grafo no tiene transiciones válidas.');
		}

		if (
			block.kind === 'choice' &&
			(!Array.isArray(block.options) || !block.options.every(isChoiceOptionDraft))
		) {
			throw new LessonServiceError(
				400,
				'La definición actual del grafo no tiene opciones válidas para el bloque de decisión.'
			);
		}

		if (block.kind === 'check' && !isRecord(block.checkConfig)) {
			throw new LessonServiceError(
				400,
				'La definición actual del grafo no tiene configuración válida para el bloque de evaluación.'
			);
		}
	}

	return parsed as unknown as LessonDefinition;
}
