import type { AgentContext, ToolResult } from '$lib/types/agent';
import { AgentMemoryService } from '$lib/server/agent/memory';

interface GetStudentCourseMemoryContextParams {
	goal?: string;
	memoryTypes?: string[];
	tagsAny?: string[];
	sinceDays?: number;
	limit?: number;
	minImportance?: number;
}

export async function getStudentCourseMemoryContext(
	params: GetStudentCourseMemoryContextParams,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.getStudentCourseMemoryContext(params, context);
		return {
			success: true,
			data: result,
			displayText:
				result.resultCount > 0
					? `Recuperé ${result.resultCount} recuerdo(s) del estudiante en este curso.`
					: 'No encontré recuerdos previos relevantes del estudiante en este curso.',
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al recuperar recuerdos del estudiante del curso',
			durationMs: Date.now() - start
		};
	}
}
