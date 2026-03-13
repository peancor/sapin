import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { MemoryWriteInput } from '$lib/types/agentMemory';
import { AgentMemoryService } from '$lib/server/agent/memory';

export async function storeStudentActivityMemory(
	params: MemoryWriteInput,
	context: AgentContext
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.storeStudentActivityMemory(params, context);
		return {
			success: true,
			data: result,
			displayText: result.stored
				? 'He guardado el recuerdo para futuras interacciones en esta actividad.'
				: result.reason ?? 'No se guardó el recuerdo propuesto.',
			durationMs: Date.now() - start
		};
	} catch (error) {
		return {
			success: false,
			errorMessage: error instanceof Error ? error.message : 'Error al guardar recuerdo',
			durationMs: Date.now() - start
		};
	}
}
