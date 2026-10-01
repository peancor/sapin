import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { DBUserUtils, LoginUtils } from '$lib/server/db';
import { LessonService } from '$lib/server/lesson/LessonService';
import { resolveExternalIdSearchParam } from '$lib/server/students/externalIdSearchParam';
import { resolveMoodleLinkVerification } from '$lib/server/students/moodleLinkVerification';

export const load = (async (event) => {
	const moodleLinkVerification = await resolveMoodleLinkVerification({
		activityId: event.params.interactiveLearningId,
		expectedActivityType: 'lesson',
		searchParams: event.url.searchParams,
		user: event.locals.user
	});
	if (moodleLinkVerification) {
		return {
			moodleLinkVerification,
			sessionId: null,
			courseId: moodleLinkVerification.courseId,
			activityId: event.params.interactiveLearningId
		};
	}

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
		moodleLinkVerification: null,
		sessionId: session.id,
		courseId: session.courseId,
		activityId: session.interactiveLearningId
	};
}) satisfies PageServerLoad;
