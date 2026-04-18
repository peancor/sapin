import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload = (await request.json().catch(() => ({}))) as {
			optionIds?: string[];
			value?: string | number;
		};

		const result = await LessonService.submitCheck({
			sessionId: params.sessionId,
			blockId: params.blockId,
			optionIds: payload.optionIds,
			value: payload.value,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		return json({
			sessionId: result.session.id,
			currentBlockId: result.session.currentBlockId,
			outputs: result.outputs,
			completed: result.completed
		});
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson] check error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
