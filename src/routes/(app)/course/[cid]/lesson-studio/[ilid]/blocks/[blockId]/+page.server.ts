import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';
import {
	lessonBlockHref,
	lessonDebuggerHref,
	lessonFlowHref
} from '$lib/lesson/lessonStudioNavigation';
import type { LessonBlock } from '$lib/types/lesson';
import {
	loadLessonStudioData,
	requireLessonStudioContext,
	uploadLessonStudioFile
} from '$lib/server/lesson/LessonStudioService';

export const load = (async ({ params, locals }) => {
	const data = await loadLessonStudioData(params.cid, params.ilid, locals);
	const block = LessonService.getBlock(data.definition, params.blockId);
	const graphSummary = LessonService.getBlockGraphSummary(data.definition, params.blockId);
	const availableReferenceGroups = LessonService.getAvailableReferenceGroups(data.definition);

	return {
		...data,
		block,
		graphSummary,
		availableVariables: LessonService.getAvailableVariables(data.definition),
		availableReferenceGroups
	};
}) satisfies PageServerLoad;

export const actions = {
	saveBlock: async ({ request, params, locals }) => {
		const { user } = await requireLessonStudioContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const blockJson = formData.get('blockJson')?.toString();
		const redirectTo = formData.get('redirectTo')?.toString();

		if (!blockJson) {
			return fail(400, {
				error: 'No se recibió la definición del bloque.'
			});
		}

		let parsedBlock: LessonBlock;
		try {
			parsedBlock = JSON.parse(blockJson) as LessonBlock;
		} catch {
			return fail(400, {
				error: 'La definición del bloque no es un JSON válido.'
			});
		}

		try {
			const revisionState = await LessonRevisionService.ensureLessonRevisionState(params.ilid, {
				actorUserId: user.id
			});
			const nextDefinition = LessonService.updateBlockDraft(
				revisionState.draftDefinition,
				params.blockId,
				parsedBlock
			);

			await LessonRevisionService.saveDraftDefinition({
				interactiveLearningId: params.ilid,
				definition: nextDefinition,
				actorUserId: user.id
			});

			const context = { cid: params.cid, ilid: params.ilid };
			const target =
				redirectTo === 'flow'
					? lessonFlowHref(context, parsedBlock.id)
					: redirectTo === 'debug'
						? lessonDebuggerHref(context, {
								source: 'block',
								blockId: parsedBlock.id,
								view: 'debug',
								intent: 'inspect'
							})
						: redirectTo === 'preview'
							? lessonDebuggerHref(context, {
									source: 'block',
									blockId: parsedBlock.id,
									view: 'student',
									intent: 'run',
									fresh: true
								})
							: lessonBlockHref(context, parsedBlock.id);

			redirect(303, target);
		} catch (errorValue) {
			if (errorValue instanceof LessonServiceError) {
				return fail(errorValue.status, {
					error: errorValue.message
				});
			}

			throw errorValue;
		}
	},

	uploadInlineImage: async ({ request, params, locals }) => {
		const { user } = await requireLessonStudioContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const file = formData.get('file');

		if (!(file instanceof File)) {
			return fail(400, {
				error: 'No se recibió ninguna imagen.'
			});
		}

		if (!file.type.startsWith('image/')) {
			return fail(400, {
				error: 'Solo se pueden pegar o soltar imágenes.'
			});
		}

		const createdFile = await uploadLessonStudioFile({
			ilid: params.ilid,
			userId: user.id,
			file,
			type: 'IMAGE'
		});

		return {
			success: true,
			id: createdFile.id,
			name: createdFile.name,
			path: createdFile.path,
			markdown: `![${createdFile.name}](${createdFile.path})`
		};
	}
} satisfies Actions;
