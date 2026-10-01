import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { MemoryCanvasReadInput } from '$lib/types/agentMemory';
import { AgentMemoryService, STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME } from '$lib/server/agent/memory';

export async function studentActivityCanvasRead(
	params: MemoryCanvasReadInput,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.executeReadTool(
			STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME,
			params,
			context
		);

		return {
			success: true,
			data: result,
			displayText: result.exists
				? 'He recuperado el canvas de memoria del estudiante en esta actividad.'
				: 'Aún no existe canvas de memoria del estudiante en esta actividad.',
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error
					? error.message
					: 'Error al leer el canvas de memoria del estudiante en la actividad',
			durationMs: Date.now() - start
		};
	}
}
