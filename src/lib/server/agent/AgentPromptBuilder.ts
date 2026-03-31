import type { AgentActivityConfig, ToolDefinitionResolved } from '$lib/types/agent';
import { getFinalizationGuardedUpdateToolNames } from './memory';

export interface AgentPromptSegments {
    baseSystemPrompt: string;
    memoryPrompt: string | null;
    ragPrompt: string | null;
}

/**
 * Builds the system prompt for the agent, including tool descriptions
 * and optional RAG context.
 */
export class AgentPromptBuilder {
    private static readonly BASE_TEMPLATE = `Eres {role}.

{instructions}

{context}

{memory_section}

## Herramientas disponibles

Tienes acceso a las siguientes herramientas para ayudar al estudiante:

{tools_section}

## Instrucciones de comportamiento

- Responde siempre en el idioma del estudiante
- Usa las herramientas cuando sean necesarias para dar respuestas precisas y actualizadas
- Despues de usar una herramienta, integra el resultado en tu respuesta de manera natural
- Si el resultado de una herramienta no es util, reconocelo y explica por que
- Manten un tono educativo, alentador y adaptado al nivel del estudiante
- Para matematicas usa notacion LaTeX con $expresion$ para inline y $$expresion$$ para bloque
- Evita usar \\( ... \\) y \\[ ... \\] en salidas nuevas
- {finalization_instruction}

{rag_section}`;

    static buildPromptSegments(
        config: AgentActivityConfig,
        tools: ToolDefinitionResolved[],
        ragContext?: string | null,
        memoryContext?: string | null
    ): AgentPromptSegments {
        const role = config.llmRole || 'Asistente educativo especializado';
        const instructions =
            config.llmInstructions ||
            'Ayuda al estudiante a aprender y comprender el material del curso.';
        const context =
            config.llmContext ||
            'Utiliza tu conocimiento y las herramientas disponibles para ayudar al estudiante.';

        const toolsSection =
            tools.length > 0
                ? tools
                        .map(
                            (t) =>
                                `### ${t.displayName} (\`${t.name}\`)\n${t.description}${t.requiresConfirmation ? '\n> Esta herramienta requiere confirmacion del usuario antes de ejecutarse.' : ''}`
                        )
                        .join('\n\n')
                : 'No hay herramientas especiales disponibles en esta actividad.';

        const memoryPrompt = memoryContext?.trim() || null;
        const ragPrompt = ragContext
            ? `## Contexto del material del curso\n\nUtiliza la siguiente informacion de los documentos del curso como referencia prioritaria:\n\n[[CONTEXTO_RAG]]\n${ragContext}\n[[FIN_CONTEXTO_RAG]]`
            : null;
        const finalizationToolName = config.finalizationToolName?.trim() || 'finalize_activity';
        const enabledToolNames = new Set(tools.map((tool) => tool.name));
		const memorySyncInstruction = getFinalizationGuardedUpdateToolNames(enabledToolNames)
			.map((toolName) => `\`${toolName}\``)
			.join(' y ');
        const finalizationInstruction = config.finalizationEnabled
            ? memorySyncInstruction
                ? `Cuando completes completamente el objetivo de la actividad, primero sincroniza la memoria con ${memorySyncInstruction} y solo despues llama la herramienta \`${finalizationToolName}\` una sola vez para cerrar la sesion`
                : `Cuando completes completamente el objetivo de la actividad, llama la herramienta \`${finalizationToolName}\` una sola vez para cerrar la sesion`
            : 'Cierra la sesion de forma natural cuando completes el objetivo';

        const prompt = config.systemPrompt || this.BASE_TEMPLATE;
        const baseSystemPrompt = prompt
            .replace(/{role}/g, role)
            .replace(/{instructions}/g, instructions)
            .replace(/{context}/g, context)
            .replace(/{memory_section}/g, '')
            .replace(/{tools_section}/g, toolsSection)
            .replace(/{finalization_instruction}/g, finalizationInstruction)
            .replace(/{rag_section}/g, '')
            .trim();

        return {
            baseSystemPrompt,
            memoryPrompt,
            ragPrompt
        };
    }

    static buildSystemPrompt(
        config: AgentActivityConfig,
        tools: ToolDefinitionResolved[],
        ragContext?: string | null,
        memoryContext?: string | null
    ): string {
        const segments = this.buildPromptSegments(config, tools, ragContext, memoryContext);

        return [segments.baseSystemPrompt, segments.memoryPrompt, segments.ragPrompt]
            .filter((segment): segment is string => !!segment)
            .join('\n\n');
    }
}
