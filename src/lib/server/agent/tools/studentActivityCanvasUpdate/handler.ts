import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { MemoryCanvasUpdateInput } from '$lib/types/agentMemory';
import { AgentMemoryService, STUDENT_ACTIVITY_CANVAS_UPDATE_TOOL_NAME } from '$lib/server/agent/memory';

export async function studentActivityCanvasUpdate(
	params: MemoryCanvasUpdateInput,
	context: AgentContext,
	toolCallId?: string
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.executeUpdateTool(
			STUDENT_ACTIVITY_CANVAS_UPDATE_TOOL_NAME,
			params,
			context,
			toolCallId
		);

		const displayText =
			result.status === 'updated'
				? 'He sincronizado el canvas de la actividad con nueva información del estudiante.'
				: 'He comprobado el canvas de la actividad y no necesitaba cambios.';

		return {
			success: true,
			data: result,
			displayText,
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error
					? error.message
					: 'Error al actualizar el canvas de memoria del estudiante en la actividad',
			durationMs: Date.now() - start
		};
	}
}
