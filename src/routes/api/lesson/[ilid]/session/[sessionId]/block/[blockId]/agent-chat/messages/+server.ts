import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AgentTranscriptService } from '$lib/server/agent/AgentTranscriptService';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const sessionId = params.sessionId;
	const blockId = params.blockId;
	if (!sessionId || !blockId) {
		return json({ error: 'Missing route params' }, { status: 400 });
	}

	try {
		const runtime = await LessonService.getLessonAgentRuntimeContext({
			sessionId,
			blockId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		return json({
			messages: await AgentTranscriptService.getDisplayMessages(runtime.blockVisit.chatId!)
		});
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson-agent] messages error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
