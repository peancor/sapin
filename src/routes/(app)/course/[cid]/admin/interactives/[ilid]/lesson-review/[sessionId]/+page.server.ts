import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireLessonStudioContext } from '$lib/server/lesson/LessonStudioService';
import { LessonReviewService } from '$lib/server/lesson/LessonReviewService';
import { LessonServiceError } from '$lib/server/lesson/LessonServiceError';

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
