import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireLessonAdminContext } from '../../lessonedit/lessonAdmin';
import { LessonReviewService } from '$lib/server/lesson/LessonReviewService';
import { LessonServiceError } from '$lib/server/lesson/LessonServiceError';

export const load = (async ({ params, locals }) => {
	const { activity } = await requireLessonAdminContext(params.cid, params.ilid, locals);

	try {
		return {
			activity,
			detail: await LessonReviewService.getStudentDetail({
				courseId: params.cid,
				activity,
				studentId: params.sid
			})
		};
	} catch (errorValue) {
		if (errorValue instanceof LessonServiceError) {
			throw error(errorValue.status, errorValue.message);
		}

		throw errorValue;
	}
}) satisfies PageServerLoad;
