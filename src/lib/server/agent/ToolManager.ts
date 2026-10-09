import { z } from 'zod';
import { jsonSchemaToZod, type JsonSchemaProperty } from './toolParameterSchema';
import { tool as aiTool } from 'ai';
import type { ToolDefinitionResolved } from '$lib/types/agent';

/**
 * ToolManager: resuelve las herramientas habilitadas para una actividad
 * al formato de herramientas del Vercel AI SDK v6.
 *
 * API v6: `tool()` usa `inputSchema` (no `parameters`) y el execute
 * recibe `input` como primer argumento (no `args`).
 */
export class ToolManager {
	static buildVercelAITools(
		tools: ToolDefinitionResolved[],
		executeHandler: (
			toolName: string,
			input: Record<string, unknown>,
			toolCallId: string
		) => Promise<unknown>
	): Record<string, ReturnType<typeof aiTool>> {
		const result: Record<string, ReturnType<typeof aiTool>> = {};

		for (const toolDef of tools) {
			let inputSchema: z.ZodTypeAny;
			try {
				inputSchema = jsonSchemaToZod(toolDef.parametersSchema as JsonSchemaProperty);
			} catch {
				inputSchema = z.object({}).passthrough();
			}

			const name = toolDef.name;
			result[name] = aiTool({
				description: toolDef.description,
				// v6: `inputSchema` (not `parameters`)
				inputSchema: inputSchema,
				// v6: execute receives `input` as first arg and options (with toolCallId) as second
				execute: async (input: unknown, options: { toolCallId: string }) => {
					return await executeHandler(name, input as Record<string, unknown>, options.toolCallId);
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);
		}

		return result;
	}
}
