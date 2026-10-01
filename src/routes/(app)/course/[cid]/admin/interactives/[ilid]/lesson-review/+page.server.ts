import type { PageServerLoad } from './$types';
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { requireLessonStudioContext } from '$lib/server/lesson/LessonStudioService';
import { LessonReviewService } from '$lib/server/lesson/LessonReviewService';
import { ActivityAttemptDeletionService } from '$lib/server/attempts/ActivityAttemptDeletionService';

export const load = (async ({ params, locals }) => {
	const { activity } = await requireLessonStudioContext(params.cid, params.ilid, locals);

	return LessonReviewService.getCohortOverview({
		courseId: params.cid,
		activity
	});
}) satisfies PageServerLoad;

export const actions = {
	deleteAttempt: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(303, '/login');

		const formData = await request.formData();
		const sessionId = String(formData.get('sessionId') ?? '');
		if (!sessionId) return fail(400, { deleteError: 'Intento no indicado.' });

		try {
			ActivityAttemptDeletionService.requireDeleteConfirmation(formData);
			await ActivityAttemptDeletionService.deleteLessonAttempt({
				courseId: params.cid!,
				activityId: params.ilid!,
				sessionId,
				deletedByUserId: locals.user.id,
				deletedBySystemRoleLevel: locals.user.highestRoleLevel,
				reason: ActivityAttemptDeletionService.normalizeReason(formData.get('reason'))
			});
		} catch (errorValue) {
			if (errorValue instanceof Response) throw errorValue;
			return fail(400, {
				deleteError:
					errorValue instanceof Error ? errorValue.message : 'No se pudo borrar el intento.'
			});
		}

		return { deletedAttemptId: sessionId };
	}
} satisfies Actions;
