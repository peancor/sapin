import { error } from '@sveltejs/kit';
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

	const lessonView = await LessonService.getSessionView({
		sessionId: params.sessionId,
		userId: user.id,
		userRoleLevel: user.highestRoleLevel
	});

	if (lessonView.session.courseId !== params.cid) {
		throw error(404, 'Lesson session not found in this course');
	}

	return lessonView;
}) satisfies PageServerLoad;
