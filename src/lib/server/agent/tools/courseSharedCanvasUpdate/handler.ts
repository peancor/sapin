import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { MemoryCanvasUpdateInput } from '$lib/types/agentMemory';
import { AgentMemoryService, COURSE_SHARED_CANVAS_UPDATE_TOOL_NAME } from '$lib/server/agent/memory';

export async function courseSharedCanvasUpdate(
	params: MemoryCanvasUpdateInput,
	context: AgentContext,
	toolCallId?: string
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.executeUpdateTool(
			COURSE_SHARED_CANVAS_UPDATE_TOOL_NAME,
			params,
			context,
			toolCallId
		);

		const displayText =
			result.status === 'updated'
				? 'He sincronizado el canvas compartido del curso.'
				: 'He comprobado el canvas compartido del curso y no necesitaba cambios.';

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
					: 'Error al actualizar el canvas compartido del curso',
			durationMs: Date.now() - start
		};
	}
}
