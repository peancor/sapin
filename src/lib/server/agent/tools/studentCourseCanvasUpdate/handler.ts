import type { AgentContext, ToolResult } from '$lib/types/agent';
import type { MemoryCanvasUpdateInput } from '$lib/types/agentMemory';
import { AgentMemoryService, STUDENT_COURSE_CANVAS_UPDATE_TOOL_NAME } from '$lib/server/agent/memory';

export async function studentCourseCanvasUpdate(
	params: MemoryCanvasUpdateInput,
	context: AgentContext,
	toolCallId?: string
): Promise<ToolResult> {
	const start = Date.now();

	try {
		const result = await AgentMemoryService.executeUpdateTool(
			STUDENT_COURSE_CANVAS_UPDATE_TOOL_NAME,
			params,
			context,
			toolCallId
		);

		const displayText =
			result.status === 'updated'
				? 'He sincronizado el canvas del curso con nueva información del estudiante.'
				: 'He comprobado el canvas del curso y no necesitaba cambios.';

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
					: 'Error al actualizar el canvas de memoria del estudiante en el curso',
			durationMs: Date.now() - start
		};
	}
}
