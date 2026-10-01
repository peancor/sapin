import type { AgentContext } from '$lib/types/agent';
import type { MemoryCanvasScopeResolved } from '$lib/types/agentMemory';
import { getCanvasScopeProfileByToolName } from './CanvasScopeRegistry';

export class MemoryScopeResolver {
	static resolve(context: AgentContext, toolName: string): MemoryCanvasScopeResolved {
		const profile = getCanvasScopeProfileByToolName(toolName);
		if (!profile) {
			throw new Error(`Herramienta de memoria no soportada: ${toolName}`);
		}

		return profile.resolve(context);
	}
}
