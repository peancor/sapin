import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireLessonStudioContext } from '$lib/server/lesson/LessonStudioService';
import { LessonReviewService } from '$lib/server/lesson/LessonReviewService';
import { LessonServiceError } from '$lib/server/lesson/LessonServiceError';
import { ActivityAttemptDeletionService } from '$lib/server/attempts/ActivityAttemptDeletionService';

export const load = (async ({ params, locals }) => {
	const { activity } = await requireLessonStudioContext(params.cid, params.ilid, locals);

	try {
		return {
			activity,
			detail: await LessonReviewService.getAttemptDetail({
				courseId: params.cid,
				activity,
				sessionId: params.sessionId
			})
		};
	} catch (errorValue) {
		if (errorValue instanceof LessonServiceError) {
			throw error(errorValue.status, errorValue.message);
		}

		throw errorValue;
	}
}) satisfies PageServerLoad;

export const actions = {
	deleteAttempt: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(303, '/login');

		const formData = await request.formData();
		let result;
		try {
			ActivityAttemptDeletionService.requireDeleteConfirmation(formData);
			result = await ActivityAttemptDeletionService.deleteLessonAttempt({
				courseId: params.cid!,
				activityId: params.ilid!,
				sessionId: params.sessionId!,
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
		const basePath = `/course/${params.cid}/admin/interactives/${params.ilid}/lesson-review`;
		const nextUrl = await ActivityAttemptDeletionService.getNextLessonReviewSessionUrl({
			courseId: params.cid!,
			activityId: params.ilid!,
			userId: result.userId,
			basePath
		});

		throw redirect(303, nextUrl);
	}
} satisfies Actions;
