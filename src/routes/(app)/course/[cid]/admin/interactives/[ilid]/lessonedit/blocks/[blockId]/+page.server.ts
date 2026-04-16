import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { interactiveLearning } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
import type { LessonBlock } from '$lib/types/lesson';
import {
	loadLessonAdminData,
	requireLessonAdminContext,
	uploadLessonFile
} from '../../lessonAdmin';

export const load = (async ({ params, locals }) => {
	const data = await loadLessonAdminData(params.cid, params.ilid, locals);
	const block = LessonService.getBlock(data.definition, params.blockId);

	return {
		...data,
		block,
		availableVariables: LessonService.getAvailableVariables(data.definition)
	};
}) satisfies PageServerLoad;

export const actions = {
	saveBlock: async ({ request, params, locals }) => {
		const { activity } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const blockJson = formData.get('blockJson')?.toString();

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
			const definition = LessonService.parseDefinition(activity.content);
			const nextDefinition = LessonService.updateBlock(definition, params.blockId, parsedBlock);

			await db
				.update(interactiveLearning)
				.set({
					content: LessonService.serializeDefinition(nextDefinition),
					updatedAt: new Date()
				})
				.where(eq(interactiveLearning.id, params.ilid));

			redirect(
				303,
				`/course/${params.cid}/admin/interactives/${params.ilid}/lessonedit/blocks/${parsedBlock.id}`
			);
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
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
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

		const createdFile = await uploadLessonFile({
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
