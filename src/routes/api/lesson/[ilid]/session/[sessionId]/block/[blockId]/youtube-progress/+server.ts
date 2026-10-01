import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

const youtubeProgressEvents = ['started', 'pause_point_acknowledged', 'completed'] as const;
type YoutubeProgressEvent = (typeof youtubeProgressEvents)[number];

function isYoutubeProgressEvent(value: unknown): value is YoutubeProgressEvent {
	return (
		typeof value === 'string' && youtubeProgressEvents.some((eventType) => eventType === value)
	);
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const payload = (await request.json().catch(() => ({}))) as {
			eventType?: unknown;
			currentTime?: unknown;
			pausePointId?: unknown;
			duration?: unknown;
		};

		if (!isYoutubeProgressEvent(payload.eventType)) {
			return json({ error: 'Evento de progreso YouTube no soportado.' }, { status: 400 });
		}

		const result = await LessonService.recordYoutubeProgress({
			sessionId: params.sessionId,
			blockId: params.blockId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid,
			eventType: payload.eventType,
			currentTime: typeof payload.currentTime === 'number' ? payload.currentTime : undefined,
			pausePointId: typeof payload.pausePointId === 'string' ? payload.pausePointId : undefined,
			duration: typeof payload.duration === 'number' ? payload.duration : undefined
		});

		return json({
			sessionId: params.sessionId,
			currentBlockId: params.blockId,
			outputs: result.outputs,
			completed: result.completed
		});
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson] youtube progress error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
