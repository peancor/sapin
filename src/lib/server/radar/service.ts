import { db } from '$lib/server/db';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { RadarRepository } from './RadarRepository';
import { RadarWorker } from './RadarWorker';
import { canUseRadar } from './access';
import { RadarActionRepository } from './RadarActionRepository';
import { RadarActionWorker } from './RadarActionWorker';

export const radarRepository = new RadarRepository(db);
export const radarActionRepository = new RadarActionRepository(radarRepository);
export const radarActionWorker = new RadarActionWorker(
	radarActionRepository,
	{
		generate: (schema, messages, execution, abortSignal, maxOutputTokens) => {
			const run = radarRepository.get(execution.runId);
			return AIUtils.generateObjectFromMessages(
				messages,
				execution.modelId,
				schema,
				{
					userId: execution.actorId ?? undefined,
					courseId: run.courseId,
					interactiveLearningId: run.activityId
				},
				{
					abortSignal,
					maxOutputTokens,
					maxRetries: 0,
					metadata: {
						subsystem: 'radar-action',
						radarRunId: run.id,
						radarActionExecutionId: execution.id
					}
				}
			);
		}
	},
	canUseRadar
);
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
		void radarActionWorker
			.tick()
			.catch(() => console.error('[Radar] No se pudieron revisar las acciones pendientes.'));
		void radarWorker
			.tick()
			.catch(() => console.error('[Radar] No se pudo revisar el trabajo pendiente.'));
	};
	state.sapinRadarTimer = setInterval(tick, 10000);
	state.sapinRadarTimer.unref();
	tick();
}
