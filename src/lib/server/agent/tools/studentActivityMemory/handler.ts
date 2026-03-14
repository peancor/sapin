import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { UnifiedMemoryToolInput } from '$lib/types/agentMemory';
import { AgentMemoryService, STUDENT_ACTIVITY_MEMORY_TOOL_NAME } from '$lib/server/agent/memory';

export async function studentActivityMemory(
	params: UnifiedMemoryToolInput,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.executeScopedMemoryAction(
			STUDENT_ACTIVITY_MEMORY_TOOL_NAME,
			params,
			context
		);

		return {
			success: true,
			data: result,
			displayText:
				result.action === 'read'
					? result.resultCount && result.resultCount > 0
						? `Recuperé ${result.resultCount} recuerdo(s) del estudiante para esta actividad.`
						: 'No encontré recuerdos previos relevantes en esta actividad.'
					: result.stored
						? 'He guardado el recuerdo para futuras interacciones en esta actividad.'
						: result.reason ?? 'No se guardó el recuerdo propuesto.',
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error
					? error.message
					: 'Error al ejecutar la herramienta de memoria del estudiante en la actividad',
			durationMs: Date.now() - start
		};
	}
}
