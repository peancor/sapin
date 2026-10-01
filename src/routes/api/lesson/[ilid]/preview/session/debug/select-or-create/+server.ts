import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { CourseInteractiveAuthUtils } from '$lib/server/db';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload = (await request.json().catch(() => ({}))) as {
			courseId?: string;
			previewMode?: 'draft' | 'published';
			sessionId?: string | null;
			forceNew?: boolean;
		};
		if (!payload.courseId) {
			return json({ error: 'Missing courseId' }, { status: 400 });
		}

		const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
			locals.user.id,
			payload.courseId,
			params.ilid,
			locals.user.highestRoleLevel
		);
		if (!access.allowed) {
			return json(
				{ error: access.reason || 'No tienes permisos para depurar esta lesson' },
				{ status: 403 }
			);
		}

		const session = await LessonService.selectOrCreatePreviewSession({
			interactiveLearningId: params.ilid,
			userId: locals.user.id,
			userRoleLevel: locals.user.highestRoleLevel,
			courseId: payload.courseId,
			previewMode: payload.previewMode === 'published' ? 'published' : 'draft',
			sessionId: payload.sessionId ?? null,
			forceNew: payload.forceNew === true
		});

		return json({ sessionId: session.id, status: session.status });
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson-studio-debug] select-or-create preview session error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
