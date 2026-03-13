import type { AgentContext } from '$lib/types/agent';
import { MEMORY_READ_TOOL_NAME, MEMORY_SCOPE_RESERVED_INPUT_KEYS, MEMORY_WRITE_TOOL_NAME } from './constants';
import { MemorySchemaRegistry } from './MemorySchemaRegistry';

export class MemoryPolicy {
	static sanitizeInput(input: Record<string, unknown>) {
		const sanitizedInput = { ...input };
		const ignoredScopeFields = MEMORY_SCOPE_RESERVED_INPUT_KEYS.filter((key) => key in sanitizedInput);
		for (const key of ignoredScopeFields) {
			delete sanitizedInput[key];
		}

		return { sanitizedInput, ignoredScopeFields };
	}

	static getReadableMemoryTypes(toolName: string) {
		return MemorySchemaRegistry.getReadableMemoryTypes(toolName);
	}

	static getWritableMemoryTypes(toolName: string) {
		return MemorySchemaRegistry.getWritableMemoryTypes(toolName);
	}

	static isPromptPrefetchEnabled(context: AgentContext): boolean {
		return context.enabledTools.some((tool) => tool.name === MEMORY_READ_TOOL_NAME);
	}

	static isMemoryTool(toolName: string): boolean {
		return toolName === MEMORY_READ_TOOL_NAME || toolName === MEMORY_WRITE_TOOL_NAME;
	}
}
