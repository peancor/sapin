import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CourseRoleUtils } from '$lib/server/db';
import { LessonService } from '$lib/server/lesson/LessonService';

export const load = (async ({ params, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const userCourseRole = await CourseRoleUtils.getUserHighestCourseRole(user.id, params.cid);
	if (!userCourseRole) {
		throw error(403, 'Not enrolled in this course');
	}

	const session = await LessonService.startOrResumeSession({
		interactiveLearningId: params.interactiveLearningId,
		userId: user.id,
		userRoleLevel: user.highestRoleLevel,
		courseId: params.cid
	});

	throw redirect(302, `/course/${params.cid}/run/lesson/${session.id}`);
}) satisfies PageServerLoad;
