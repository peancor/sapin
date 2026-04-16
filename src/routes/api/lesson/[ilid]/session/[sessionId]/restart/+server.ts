import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const POST: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const session = await LessonService.restartSession({
			sessionId: params.sessionId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel
		});

		return json({ sessionId: session.id });
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson] restart error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
