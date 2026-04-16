import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload = (await request.json().catch(() => ({}))) as { message?: string };
		if (!payload.message) {
			return json({ error: 'Missing message' }, { status: 400 });
		}

		const result = await LessonService.submitAgentTurn({
			sessionId: params.sessionId,
			blockId: params.blockId,
			message: payload.message,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		return json({
			sessionId: result.session.id,
			assistantMessage: result.assistantMessage,
			outputs: result.outputs
		});
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson] agent error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
