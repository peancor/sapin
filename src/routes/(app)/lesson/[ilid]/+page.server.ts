import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, InteractiveChatAuthUtils } from '$lib/server/db';
import { eq, and, desc } from 'drizzle-orm';
import { interactiveLearning, interactiveLearningLesson, interactiveLessonSession } from '$lib/server/db/schema';
import { LessonService } from '$lib/server/lesson/LessonService';

export const load = (async ({ params, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
		user.id,
		params.ilid,
		user.highestRoleLevel
	);

	if (!access.allowed) {
		throw error(403, access.reason || 'Sin acceso a esta lesson');
	}

	const [activity, lessonConfig] = await Promise.all([
		db.select().from(interactiveLearning).where(eq(interactiveLearning.id, params.ilid)).get(),
		db
			.select()
			.from(interactiveLearningLesson)
			.where(eq(interactiveLearningLesson.id, params.ilid))
			.get()
	]);

	if (!activity || activity.type !== 'lesson' || !lessonConfig) {
		throw error(404, 'Lesson no encontrada');
	}

	const canManage = access.isSystemAdmin || ['owner', 'admin', 'teacher', 'assistant'].includes(access.courseRole || '');

	if (!canManage && activity.status !== 'published' && activity.status !== 'closed') {
		throw error(404, 'Lesson no disponible');
	}

	const latestSession = access.courseId
		? await db
				.select()
				.from(interactiveLessonSession)
				.where(
					and(
						eq(interactiveLessonSession.interactiveLearningId, params.ilid),
						eq(interactiveLessonSession.userId, user.id),
						eq(interactiveLessonSession.courseId, access.courseId)
					)
				)
				.orderBy(desc(interactiveLessonSession.attemptNumber), desc(interactiveLessonSession.createdAt))
				.get()
		: null;

	return {
		interactiveLearning: activity,
		lessonConfig,
		definition: LessonService.parseDefinition(activity.content),
		userAccess: {
			courseId: access.courseId,
			canManage
		},
		latestSession
	};
}) satisfies PageServerLoad;
