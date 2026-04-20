import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';
import { lessonBlockKinds, type LessonBlockKind } from '$lib/types/lesson';
import { loadLessonAdminData, requireLessonAdminContext } from '../../lessonAdmin';

function resolveRequestedKind(value: string | null | undefined): LessonBlockKind {
	return lessonBlockKinds.includes(value as LessonBlockKind) ? (value as LessonBlockKind) : 'content';
}

export const load = (async ({ params, locals, url }) => {
	const data = await loadLessonAdminData(params.cid, params.ilid, locals);
	return {
		...data,
		selectedKind: resolveRequestedKind(url.searchParams.get('kind'))
	};
}) satisfies PageServerLoad;

export const actions = {
	createBlock: async ({ request, params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const kind = resolveRequestedKind(formData.get('kind')?.toString());

		try {
			const revisionState = await LessonRevisionService.ensureLessonRevisionState(params.ilid, {
				actorUserId: user.id
			});
			const { definition, block } = LessonService.createBlock(
				revisionState.draftDefinition,
				kind
			);

			await LessonRevisionService.saveDraftDefinition({
				interactiveLearningId: params.ilid,
				definition,
				actorUserId: user.id
			});

			redirect(
				303,
				`/course/${params.cid}/admin/interactives/${params.ilid}/lessonedit/blocks/${block.id}`
			);
		} catch (errorValue) {
			if (errorValue instanceof LessonServiceError) {
				return fail(errorValue.status, {
					error: errorValue.message
				});
			}

			throw errorValue;
		}
	}
} satisfies Actions;
