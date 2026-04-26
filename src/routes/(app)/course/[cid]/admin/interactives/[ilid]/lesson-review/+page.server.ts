import type { PageServerLoad } from './$types';
import { requireLessonStudioContext } from '$lib/server/lesson/LessonStudioService';
import { LessonReviewService } from '$lib/server/lesson/LessonReviewService';

export const load = (async ({ params, locals }) => {
	const { activity } = await requireLessonStudioContext(params.cid, params.ilid, locals);

	return LessonReviewService.getCohortOverview({
		courseId: params.cid,
		activity
	});
}) satisfies PageServerLoad;
