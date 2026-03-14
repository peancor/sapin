import type { AgentContext } from '$lib/types/agent';
import { ALL_MEMORY_TOOL_NAMES, MEMORY_SCOPE_RESERVED_INPUT_KEYS, STUDENT_COURSE_MEMORY_TOOL_NAME } from './constants';
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
		return context.enabledTools.some((tool) => tool.name === STUDENT_COURSE_MEMORY_TOOL_NAME);
	}

	static isMemoryTool(toolName: string): boolean {
		return ALL_MEMORY_TOOL_NAMES.includes(toolName as (typeof ALL_MEMORY_TOOL_NAMES)[number]);
	}
}
