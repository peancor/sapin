import { StaffAgentAnalyticsService } from '$lib/server/staff-agent';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	courseId?: string;
	studentIds?: string[];
	limit?: number;
}

export async function getCourseStudentSignals(
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
		const result = await StaffAgentAnalyticsService.getCourseStudentSignals(
			{ actorUserId: context.userId },
			{
				courseId,
				studentIds: params.studentIds,
				limit: params.limit
			}
		);

		return {
			success: true,
			data: result,
			displayText: `Senales calculadas para ${result.totalStudents} estudiante(s).`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al calcular senales del curso',
			durationMs: Date.now() - start
		};
	}
}
