import { z } from 'zod';
import { tool as aiTool } from 'ai';
import type { ToolDefinitionResolved } from '$lib/types/agent';

type JsonSchemaProperty = {
    type?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
};

/**
 * Convierte un JSON Schema a un schema Zod para la validación de parámetros.
 */
function jsonSchemaToZod(schema: JsonSchemaProperty): z.ZodTypeAny {
    const type = schema.type;

    switch (type) {
        case 'string': {
            let s = z.string();
            if (schema.description) s = s.describe(schema.description);
            if (schema.minLength !== undefined) s = s.min(schema.minLength);
            if (schema.maxLength !== undefined) s = s.max(schema.maxLength);
            if (schema.pattern) s = s.regex(new RegExp(schema.pattern));
            if (schema.enum) {
                const values = schema.enum as [string, ...string[]];
                return z.enum(values);
            }
            if (schema.default !== undefined) return s.default(schema.default as string);
            return s;
        }

        case 'number':
        case 'integer': {
            let n = schema.type === 'integer' ? z.number().int() : z.number();
            if (schema.description) n = n.describe(schema.description);
            if (schema.minimum !== undefined) n = n.min(schema.minimum);
            if (schema.maximum !== undefined) n = n.max(schema.maximum);
            if (schema.default !== undefined) return n.default(schema.default as number);
            return n;
        }

        case 'boolean': {
            const b = schema.description ? z.boolean().describe(schema.description) : z.boolean();
            if (schema.default !== undefined) return b.default(schema.default as boolean);
            return b;
        }

        case 'object': {
            if (!schema.properties) return z.object({});
            const shape: Record<string, z.ZodTypeAny> = {};
            for (const [key, prop] of Object.entries(schema.properties)) {
                shape[key] = jsonSchemaToZod(prop);
            }
            const required = new Set(schema.required ?? []);
            const partialShape: Record<string, z.ZodTypeAny> = {};
            for (const [key, zodType] of Object.entries(shape)) {
                partialShape[key] = required.has(key) ? zodType : zodType.optional();
            }
            return z.object(partialShape);
        }

        case 'array': {
            const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.unknown();
            const arr = z.array(itemSchema);
            return schema.description ? arr.describe(schema.description) : arr;
        }

        default:
            return z.unknown();
    }
}

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
