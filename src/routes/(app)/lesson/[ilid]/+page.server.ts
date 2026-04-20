import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, InteractiveChatAuthUtils } from '$lib/server/db';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import {
	interactiveLearning,
	interactiveLearningLesson,
	interactiveLessonSession,
	lessonSessionScope
} from '$lib/server/db/schema';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';

export const load = (async ({ params, locals, url }) => {
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

	const previewMode =
		canManage && url.searchParams.get('preview') === 'draft'
			? 'draft'
			: canManage && url.searchParams.get('preview') === 'published'
				? 'published'
				: null;
	const revisionState = await LessonRevisionService.ensureLessonRevisionState(params.ilid, {
		actorUserId: user.id
	});
	const definition =
		previewMode === 'draft'
			? revisionState.draftDefinition
			: revisionState.publishedDefinition;
	const latestScope =
		previewMode === 'draft'
			? lessonSessionScope.PREVIEW_DRAFT
			: previewMode === 'published'
				? lessonSessionScope.PREVIEW_PUBLISHED
				: lessonSessionScope.LEARNER;

	const latestSession =
		access.courseId && previewMode !== 'draft'
		? await db
				.select()
				.from(interactiveLessonSession)
				.where(
					and(
						eq(interactiveLessonSession.interactiveLearningId, params.ilid),
						eq(interactiveLessonSession.userId, user.id),
						eq(interactiveLessonSession.courseId, access.courseId),
						eq(interactiveLessonSession.scope, latestScope),
						isNotNull(interactiveLessonSession.definitionRevisionId)
					)
				)
				.orderBy(desc(interactiveLessonSession.attemptNumber), desc(interactiveLessonSession.createdAt))
				.get()
		: null;

	return {
		interactiveLearning: activity,
		lessonConfig: revisionState.lesson,
		definition,
		revisionSummary: {
			published: revisionState.publishedRevision.revisionNumber,
			draft: revisionState.draftRevision.revisionNumber
		},
		previewMode,
		userAccess: {
			courseId: access.courseId,
			canManage
		},
		latestSession
	};
}) satisfies PageServerLoad;
