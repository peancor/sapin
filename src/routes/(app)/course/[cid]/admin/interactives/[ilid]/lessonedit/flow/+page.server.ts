import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { interactiveLearning } from '$lib/server/db/schema';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
import { lessonBlockKinds, type LessonBlock, type LessonBlockKind } from '$lib/types/lesson';
import { loadLessonAdminData, requireLessonAdminContext } from '../lessonAdmin';

function asLessonError(errorValue: unknown, fallbackMessage: string) {
	if (errorValue instanceof LessonServiceError) {
		return fail(errorValue.status, {
			error: errorValue.message
		});
	}

	return fail(500, {
		error: fallbackMessage
	});
}

function parseRequestedKind(value: FormDataEntryValue | null): LessonBlockKind {
	const candidate = value?.toString();
	return lessonBlockKinds.includes(candidate as LessonBlockKind)
		? (candidate as LessonBlockKind)
		: 'content';
}

function parseCoordinate(value: FormDataEntryValue | null): number {
	const parsed = Number(value?.toString() ?? '');
	return Number.isFinite(parsed) ? parsed : 0;
}

function parseDefinitionPayload(formData: FormData) {
	const definitionJson = formData.get('definitionJson')?.toString();

	if (!definitionJson) {
		throw new LessonServiceError(400, 'No se recibio la definicion actual del grafo.');
	}

	return LessonService.validateDefinition(LessonService.parseDefinition(definitionJson));
}

function disconnectBlockForFlowDraft(block: LessonBlock): LessonBlock {
	if (block.kind === 'content') {
		return {
			...block,
			next: null
		};
	}

	if (block.kind === 'agent') {
		return {
			...block,
			next: null
		};
	}

	if (block.kind === 'choice') {
		return {
			...block,
			options: block.options.map((option) => ({
				...option,
				targetBlockId: ''
			}))
		};
	}

	return block;
}

async function persistDefinition(
	ilid: string,
	definition: ReturnType<typeof LessonService.parseDefinition>
) {
	await db
		.update(interactiveLearning)
		.set({
			content: LessonService.serializeDefinition(definition),
			updatedAt: new Date()
		})
		.where(eq(interactiveLearning.id, ilid));
}

export const load = (async ({ params, locals }) => {
	return loadLessonAdminData(params.cid, params.ilid, locals);
}) satisfies PageServerLoad;

export const actions = {
	saveFlow: async ({ request, params, locals }) => {
		await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();

		try {
			const definition = parseDefinitionPayload(formData);
			await persistDefinition(params.ilid, definition);

			return {
				success: true,
				message: 'Mapa guardado correctamente.',
				definition
			};
		} catch (errorValue) {
			if (errorValue instanceof LessonServiceError) {
				return fail(errorValue.status, { error: errorValue.message });
			}

			throw errorValue;
		}
	},

	createBlock: async ({ request, params, locals }) => {
		await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();

		try {
			const definition = parseDefinitionPayload(formData);
			const kind = parseRequestedKind(formData.get('kind'));
			const position = {
				x: parseCoordinate(formData.get('positionX')),
				y: parseCoordinate(formData.get('positionY'))
			};
			const created = LessonService.createBlock(definition, kind);
			const nextDefinition = structuredClone(created.definition);
			const blockIndex = nextDefinition.blocks.findIndex((block) => block.id === created.block.id);

			if (blockIndex >= 0) {
				const draftBlock = disconnectBlockForFlowDraft(nextDefinition.blocks[blockIndex]);
				nextDefinition.blocks[blockIndex] = {
					...draftBlock,
					graph: {
						...(draftBlock.graph ?? {}),
						position
					}
				};
			}

			return {
				success: true,
				message: 'Bloque anadido al borrador. Guarda el mapa para aplicar el cambio.',
				definition: nextDefinition,
				blockId: created.block.id
			};
		} catch (errorValue) {
			if (errorValue instanceof LessonServiceError) {
				return fail(errorValue.status, { error: errorValue.message });
			}

			throw errorValue;
		}
	},

	deleteBlock: async ({ request, params, locals }) => {
		await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const blockId = formData.get('blockId')?.toString().trim();

		if (!blockId) {
			return fail(400, {
				error: 'No se indico el bloque a eliminar.'
			});
		}

		try {
			const definition = parseDefinitionPayload(formData);
			const nextDefinition = LessonService.deleteBlock(definition, blockId);

			return {
				success: true,
				message: 'Bloque retirado del borrador. Guarda el mapa para confirmar el cambio.',
				definition: nextDefinition,
				deletedBlockId: blockId
			};
		} catch (errorValue) {
			return asLessonError(errorValue, 'No se pudo eliminar el bloque.');
		}
	}
} satisfies Actions;
