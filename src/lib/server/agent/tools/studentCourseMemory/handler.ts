import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { UnifiedMemoryToolInput } from '$lib/types/agentMemory';
import { AgentMemoryService, STUDENT_COURSE_MEMORY_TOOL_NAME } from '$lib/server/agent/memory';

export async function studentCourseMemory(
	params: UnifiedMemoryToolInput,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.executeScopedMemoryAction(
			STUDENT_COURSE_MEMORY_TOOL_NAME,
			params,
			context
		);

		return {
			success: true,
			data: result,
			displayText:
				result.action === 'read'
					? result.resultCount && result.resultCount > 0
						? `Recuperé ${result.resultCount} recuerdo(s) del estudiante en este curso.`
						: 'No encontré recuerdos previos relevantes del estudiante en este curso.'
					: result.stored
						? 'He guardado el recuerdo para futuras actividades de este curso.'
						: result.reason ?? 'No se guardó el recuerdo propuesto.',
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error
					? error.message
					: 'Error al ejecutar la herramienta de memoria del estudiante en el curso',
			durationMs: Date.now() - start
		};
	}
}
