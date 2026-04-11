import { TeacherActionQueueService } from '$lib/server/learning-evidence/TeacherActionQueueService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	courseId?: string;
}

export async function getCourseSequenceBottlenecks(
	params: Params,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();
	const courseId = params.courseId ?? context.courseId;

	if (!courseId) {
		return {
			success: false,
			errorMessage: 'La herramienta requiere un courseId o un contexto de curso.',
			durationMs: Date.now() - start
		};
	}

	try {
		const result = await TeacherActionQueueService.getCourseSequenceBottlenecks(
			{ actorUserId: context.userId },
			{ courseId }
		);

		return {
			success: true,
			data: result,
			displayText: `Bottlenecks listos: ${result.summary.highSeverityCount} actividad(es) con severidad alta.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al detectar cuellos de botella del curso',
			durationMs: Date.now() - start
		};
	}
}
