import { db } from '$lib/server/db';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { RadarRepository } from './RadarRepository';
import { RadarWorker } from './RadarWorker';
import { canUseRadar } from './access';

export const radarRepository = new RadarRepository(db);
export const radarWorker = new RadarWorker(
	radarRepository,
	{
		generate: (schema, messages, run, executionId, abortSignal, maxOutputTokens) =>
			AIUtils.generateObjectFromMessages(
				messages,
				run.modelId,
				schema,
				{
					userId: run.creatorId ?? undefined,
					courseId: run.courseId,
					interactiveLearningId: run.activityId
				},
				{
					abortSignal,
					maxOutputTokens,
					maxRetries: 0,
					metadata: { subsystem: 'radar', radarRunId: run.id, radarExecutionId: executionId }
				}
			)
	},
	canUseRadar
);

const state = globalThis as typeof globalThis & {
	sapinRadarTimer?: ReturnType<typeof setInterval>;
};
export function startRadarScheduler() {
	if (state.sapinRadarTimer || process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT)
		return;
	const tick = () => {
		void radarWorker
			.tick()
			.catch(() => console.error('[Radar] No se pudo revisar el trabajo pendiente.'));
	};
	state.sapinRadarTimer = setInterval(tick, 10000);
	state.sapinRadarTimer.unref();
	tick();
}
