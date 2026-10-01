import { LearningEvidenceService } from '$lib/server/learning-evidence';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface Params {
	courseId?: string;
	studentIds?: string[];
}

export async function getCourseStudentRoster(
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
		const roster = await LearningEvidenceService.getCourseStudentRoster(
			{ actorUserId: context.userId },
			courseId,
			params.studentIds
		);

		return {
			success: true,
			data: {
				courseId,
				students: roster,
				totalStudents: roster.length
			},
			displayText: `Se recuperaron ${roster.length} estudiante(s) del curso.`,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage: error instanceof Error ? error.message : 'Error al obtener la lista de estudiantes',
			durationMs: Date.now() - start
		};
	}
}
