import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { DBUserUtils, LoginUtils } from '$lib/server/db';
import { LessonService } from '$lib/server/lesson/LessonService';
import { resolveExternalIdSearchParam } from '$lib/server/students/externalIdSearchParam';

export const load = (async (event) => {
	const externalId = resolveExternalIdSearchParam(event.url.searchParams);
	if (!externalId) error(401, 'Unauthorized');

	const userId = await DBUserUtils.existsUserWithExternalId(externalId);
	if (!userId) error(401, 'User not found');

	await LoginUtils.loginUserWithExternalId(event, externalId);

	const session = await LessonService.startOrResumeSession({
		interactiveLearningId: event.params.interactiveLearningId,
		userId,
		userRoleLevel: 0
	});

	return {
		sessionId: session.id,
		courseId: session.courseId,
		activityId: session.interactiveLearningId
	};
}) satisfies PageServerLoad;
