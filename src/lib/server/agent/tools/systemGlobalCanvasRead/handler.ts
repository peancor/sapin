import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { MemoryCanvasReadInput } from '$lib/types/agentMemory';
import { AgentMemoryService, SYSTEM_GLOBAL_CANVAS_READ_TOOL_NAME } from '$lib/server/agent/memory';

export async function systemGlobalCanvasRead(
	params: MemoryCanvasReadInput,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.executeReadTool(
			SYSTEM_GLOBAL_CANVAS_READ_TOOL_NAME,
			params,
			context
		);

		return {
			success: true,
			data: result,
			displayText: result.exists
				? 'He recuperado el canvas global del sistema.'
				: 'Aún no existe canvas global del sistema.',
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage:
				error instanceof Error ? error.message : 'Error al leer el canvas global del sistema',
			durationMs: Date.now() - start
		};
	}
}
