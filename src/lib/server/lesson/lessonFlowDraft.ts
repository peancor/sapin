import {
	lessonBlockKinds,
	normalizeLessonAgentConfig,
	normalizeLessonCheckConfig,
	type LessonBlock,
	type LessonDefinition
} from '../../types/lesson.ts';
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

function isYoutubePausePointDraft(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.seconds === 'number' &&
		(!('title' in value) || value.title === undefined || typeof value.title === 'string') &&
		(!('body' in value) || value.body === undefined || typeof value.body === 'string') &&
		(!('resumeLabel' in value) ||
			value.resumeLabel === undefined ||
			typeof value.resumeLabel === 'string')
	);
}

function normalizeYoutubeVideoIdDraft(input: string): string {
	const value = input.trim();
	if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

	const urlMatch = value.match(
		/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
	);
	return urlMatch?.[1] ?? value;
}

export function parseLessonFlowDraft(content: string): LessonDefinition {
	let parsed: unknown;

	try {
		parsed = JSON.parse(content);
	} catch {
		throw new LessonServiceError(400, 'La definición de la lesson no es un JSON válido.');
	}

	if (
		!isRecord(parsed) ||
		typeof parsed.entryBlockId !== 'string' ||
		!Array.isArray(parsed.blocks)
	) {
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
			throw new LessonServiceError(
				400,
				'La definición actual del grafo no tiene la forma esperada.'
			);
		}

		if (
			'next' in block &&
			typeof block.next !== 'string' &&
			block.next !== null &&
			block.next !== undefined
		) {
			throw new LessonServiceError(
				400,
				'La definición actual del grafo no tiene transiciones válidas.'
			);
		}

		if (
			'branches' in block &&
			block.branches !== undefined &&
			(!Array.isArray(block.branches) || !block.branches.every(isTransitionDraft))
		) {
			throw new LessonServiceError(
				400,
				'La definición actual del grafo no tiene transiciones válidas.'
			);
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

		if (
			block.kind === 'youtube' &&
			(typeof block.videoId !== 'string' ||
				('startSeconds' in block &&
					block.startSeconds !== null &&
					block.startSeconds !== undefined &&
					typeof block.startSeconds !== 'number') ||
				('endSeconds' in block &&
					block.endSeconds !== null &&
					block.endSeconds !== undefined &&
					typeof block.endSeconds !== 'number') ||
				('pausePoints' in block &&
					block.pausePoints !== undefined &&
					(!Array.isArray(block.pausePoints) ||
						!block.pausePoints.every(isYoutubePausePointDraft))))
		) {
			throw new LessonServiceError(
				400,
				'La definición actual del grafo no tiene configuración válida para el bloque de YouTube.'
			);
		}
	}

	return validateLessonAuthoringDraft(parsed as unknown as LessonDefinition);
}

function normalizeAuthoringBlock(block: LessonBlock): LessonBlock {
	if (block.kind === 'agent') {
		const agentConfig = normalizeLessonAgentConfig(block.agentConfig);
		return {
			...block,
			agentConfig,
			requiresResponse:
				agentConfig.interactionMode === 'none' ? false : (block.requiresResponse ?? true)
		};
	}

	if (block.kind === 'check') {
		return {
			...block,
			checkConfig: normalizeLessonCheckConfig(block.checkConfig)
		};
	}

	if (block.kind === 'youtube') {
		return {
			...block,
			videoId: normalizeYoutubeVideoIdDraft(block.videoId),
			startSeconds: block.startSeconds ?? null,
			endSeconds: block.endSeconds ?? null,
			pausePoints: (block.pausePoints ?? []).map((pausePoint) => ({
				...pausePoint,
				id: pausePoint.id.trim()
			}))
		};
	}

	return block;
}

function assertKnownTarget(
	blockMap: Map<string, LessonBlock>,
	targetBlockId: string,
	label: string
) {
	if (targetBlockId && !blockMap.has(targetBlockId)) {
		throw new LessonServiceError(400, `${label} apunta al bloque inexistente "${targetBlockId}".`);
	}
}

export function validateLessonAuthoringDraft(definition: LessonDefinition): LessonDefinition {
	const nextDefinition = structuredClone(definition);

	if (nextDefinition.blocks.length === 0) {
		throw new LessonServiceError(400, 'La lesson debe conservar al menos un bloque.');
	}

	const duplicatedIds = nextDefinition.blocks
		.map((block) => block.id)
		.filter((id, index, list) => list.indexOf(id) !== index);

	if (duplicatedIds.length > 0) {
		throw new LessonServiceError(
			400,
			`Hay bloques con IDs duplicados: ${[...new Set(duplicatedIds)].join(', ')}.`
		);
	}

	for (const block of nextDefinition.blocks) {
		if (!block.id.match(/^[a-zA-Z0-9_-]+$/)) {
			throw new LessonServiceError(
				400,
				`El bloque "${block.id}" usa un ID no válido. Usa letras, números, guiones o guiones bajos.`
			);
		}
	}

	if (!nextDefinition.blocks.some((block) => block.id === nextDefinition.entryBlockId)) {
		nextDefinition.entryBlockId = nextDefinition.blocks[0]?.id ?? '';
	}

	const normalizedAllowedAgentToolIds =
		nextDefinition.allowedAgentToolIds
			?.map((value) => value.trim())
			.filter(Boolean)
			.filter((value, index, list) => list.indexOf(value) === index) ?? [];

	nextDefinition.allowedAgentToolIds =
		normalizedAllowedAgentToolIds.length > 0 ? normalizedAllowedAgentToolIds : undefined;
	nextDefinition.blocks = nextDefinition.blocks.map(normalizeAuthoringBlock);

	const blockMap = new Map(nextDefinition.blocks.map((block) => [block.id, block]));

	for (const block of nextDefinition.blocks) {
		if (block.next) {
			assertKnownTarget(blockMap, block.next, `La salida principal de "${block.id}"`);
		}

		for (const branch of block.branches ?? []) {
			assertKnownTarget(blockMap, branch.targetBlockId, `La rama de "${block.id}"`);
		}

		if (block.kind === 'choice') {
			for (const option of block.options) {
				assertKnownTarget(
					blockMap,
					option.targetBlockId,
					`La opción "${option.label}" de "${block.id}"`
				);
			}
		}
	}

	return nextDefinition;
}
