import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { interactiveLearning } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
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
		const { activity } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const kind = resolveRequestedKind(formData.get('kind')?.toString());

		try {
			const { definition, block } = LessonService.createBlock(
				LessonService.parseDefinition(activity.content),
				kind
			);

			await db
				.update(interactiveLearning)
				.set({
					content: LessonService.serializeDefinition(definition),
					updatedAt: new Date()
				})
				.where(eq(interactiveLearning.id, params.ilid));

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
