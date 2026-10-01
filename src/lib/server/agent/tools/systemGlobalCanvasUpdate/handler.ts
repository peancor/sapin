import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { MemoryCanvasUpdateInput } from '$lib/types/agentMemory';
import { AgentMemoryService, SYSTEM_GLOBAL_CANVAS_UPDATE_TOOL_NAME } from '$lib/server/agent/memory';

export async function systemGlobalCanvasUpdate(
	params: MemoryCanvasUpdateInput,
	context: AgentContext,
	toolCallId?: string
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.executeUpdateTool(
			SYSTEM_GLOBAL_CANVAS_UPDATE_TOOL_NAME,
			params,
			context,
			toolCallId
		);

		const displayText =
			result.status === 'updated'
				? 'He sincronizado el canvas global del sistema.'
				: 'He comprobado el canvas global del sistema y no necesitaba cambios.';

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
				error instanceof Error ? error.message : 'Error al actualizar el canvas global del sistema',
			durationMs: Date.now() - start
		};
	}
}
