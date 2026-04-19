import type { PageServerLoad } from './$types';
import { requireLessonAdminContext } from '../lessonedit/lessonAdmin';
import { LessonReviewService } from '$lib/server/lesson/LessonReviewService';

export const load = (async ({ params, locals }) => {
	const { activity } = await requireLessonAdminContext(params.cid, params.ilid, locals);

	return LessonReviewService.getCohortOverview({
		courseId: params.cid,
		activity
	});
}) satisfies PageServerLoad;
