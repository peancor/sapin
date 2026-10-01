import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload = (await request.json().catch(() => ({}))) as { optionId?: string };
		if (!payload.optionId) {
			return json({ error: 'Missing optionId' }, { status: 400 });
		}

		const session = await LessonService.submitChoice({
			sessionId: params.sessionId,
			blockId: params.blockId,
			optionId: payload.optionId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		return json({ sessionId: session.id, currentBlockId: session.currentBlockId, status: session.status });
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson] choice error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
