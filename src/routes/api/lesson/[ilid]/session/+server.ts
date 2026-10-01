import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload = (await request.json().catch(() => ({}))) as { courseId?: string };
		const session = await LessonService.startOrResumeSession({
			interactiveLearningId: params.ilid,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			courseId: payload.courseId
		});

		return json({ sessionId: session.id, status: session.status });
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson] session create error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
