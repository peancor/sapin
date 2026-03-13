import type { AgentContext, ToolResult } from '$lib/types/agent';
import { AgentMemoryService } from '$lib/server/agent/memory';

interface GetStudentActivityMemoryContextParams {
	goal?: string;
	memoryTypes?: string[];
	tagsAny?: string[];
	sinceDays?: number;
	limit?: number;
	minImportance?: number;
}

export async function getStudentActivityMemoryContext(
	params: GetStudentActivityMemoryContextParams,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.getStudentActivityMemoryContext(params, context);
		return {
			success: true,
			data: result,
			displayText:
				result.resultCount > 0
					? `Recuperé ${result.resultCount} recuerdo(s) del estudiante para esta actividad.`
					: 'No encontré recuerdos previos relevantes en esta actividad.',
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al recuperar recuerdos del estudiante',
			durationMs: Date.now() - start
		};
	}
}
