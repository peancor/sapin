import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { parseLessonFlowDraft } from '$lib/server/lesson/lessonFlowDraft';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';
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

function parseDefinitionPayload(formData: FormData, options?: { allowDraft?: boolean }) {
	const definitionJson = formData.get('definitionJson')?.toString();

	if (!definitionJson) {
		throw new LessonServiceError(400, 'No se recibio la definicion actual del grafo.');
	}

	if (options?.allowDraft) {
		return parseLessonFlowDraft(definitionJson);
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

	if (block.kind === 'check') {
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

async function persistDefinition(input: {
	ilid: string;
	definition: ReturnType<typeof LessonService.parseDefinition>;
	userId: string;
}) {
	await LessonRevisionService.saveDraftDefinition({
		interactiveLearningId: input.ilid,
		definition: input.definition,
		actorUserId: input.userId
	});
}

export const load = (async ({ params, locals }) => {
	return loadLessonAdminData(params.cid, params.ilid, locals);
}) satisfies PageServerLoad;

export const actions = {
	saveFlow: async ({ request, params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();

		try {
			const definition = parseDefinitionPayload(formData, { allowDraft: true });
			await persistDefinition({
				ilid: params.ilid,
				definition,
				userId: user.id
			});

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
			const definition = parseDefinitionPayload(formData, { allowDraft: true });
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
				message:
					'Bloque anadido al borrador. Queda desconectado para que puedas cablearlo desde la rail superior y luego guardar el mapa.',
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
			const definition = parseDefinitionPayload(formData, { allowDraft: true });
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
	},

	publishDraft: async ({ params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);

		try {
			await LessonRevisionService.publishDraftRevision({
				interactiveLearningId: params.ilid,
				actorUserId: user.id
			});

			return {
				success: true,
				message: 'Borrador publicado. El publicado y el runtime ya apuntan a la nueva revisión.'
			};
		} catch (errorValue) {
			return asLessonError(errorValue, 'No se pudo publicar el borrador.');
		}
	},

	discardDraft: async ({ params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		await LessonRevisionService.discardDraftRevision({
			interactiveLearningId: params.ilid,
			actorUserId: user.id
		});

		return {
			success: true,
			message: 'Borrador descartado. El canvas vuelve a la revisión publicada actual.'
		};
	}
} satisfies Actions;
