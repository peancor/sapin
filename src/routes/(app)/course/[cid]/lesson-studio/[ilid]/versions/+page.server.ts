import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';
import { LessonServiceError } from '$lib/server/lesson/LessonService';
import {
	loadLessonStudioData,
	requireLessonStudioContext
} from '$lib/server/lesson/LessonStudioService';

function asLessonError(errorValue: unknown, fallbackAction: string) {
	if (errorValue instanceof LessonServiceError) {
		return fail(errorValue.status, {
			action: fallbackAction,
			error: errorValue.message
		});
	}

	throw errorValue;
}

export const load = (async ({ params, locals }) => {
	return loadLessonStudioData(params.cid, params.ilid, locals);
}) satisfies PageServerLoad;

export const actions = {
	publishDraft: async ({ params, locals }) => {
		const { user } = await requireLessonStudioContext(params.cid, params.ilid, locals);

		try {
			await LessonRevisionService.publishDraftRevision({
				interactiveLearningId: params.ilid,
				actorUserId: user.id
			});

			return {
				success: true,
				action: 'publishDraft',
				message: 'Borrador publicado. Los intentos nuevos usarán la revisión vigente.'
			};
		} catch (errorValue) {
			return asLessonError(errorValue, 'publishDraft');
		}
	},

	discardDraft: async ({ params, locals }) => {
		const { user } = await requireLessonStudioContext(params.cid, params.ilid, locals);

		await LessonRevisionService.discardDraftRevision({
			interactiveLearningId: params.ilid,
			actorUserId: user.id
		});

		return {
			success: true,
			action: 'discardDraft',
			message: 'Borrador descartado. El Studio vuelve a reflejar la revisión publicada.'
		};
	}
} satisfies Actions;
