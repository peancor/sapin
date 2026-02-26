import type { AgentActivityConfig, ToolDefinitionResolved } from '$lib/types/agent';

/**
 * Construye el system prompt para el agente, incluyendo la descripción
 * de las herramientas disponibles y el contexto RAG si corresponde.
 */
export class AgentPromptBuilder {
    private static readonly BASE_TEMPLATE = `Eres {role}.

{instructions}

{context}

## Herramientas disponibles

Tienes acceso a las siguientes herramientas para ayudar al estudiante:

{tools_section}

## Instrucciones de comportamiento

- Responde siempre en el idioma del estudiante
- Usa las herramientas cuando sean necesarias para dar respuestas precisas y actualizadas
- Después de usar una herramienta, integra el resultado en tu respuesta de manera natural
- Si el resultado de una herramienta no es útil, reconócelo y explica por qué
- Mantén un tono educativo, alentador y adaptado al nivel del estudiante
- Para matemáticas usa notación LaTeX con $expresión$ para inline y $$expresión$$ para bloque
- Evita usar \\( ... \\) y \\[ ... \\] en salidas nuevas
- Cuando hayas cubierto completamente el objetivo de la actividad, incluye la marca [[DONE]] al final

{rag_section}`;

    static buildSystemPrompt(
        config: AgentActivityConfig,
        tools: ToolDefinitionResolved[],
        ragContext?: string | null
    ): string {
        const role = config.llmRole || 'Asistente educativo especializado';
        const instructions =
            config.llmInstructions ||
            'Ayuda al estudiante a aprender y comprender el material del curso.';
        const context = config.llmContext || 'Utiliza tu conocimiento y las herramientas disponibles para ayudar al estudiante.';

        const toolsSection =
            tools.length > 0
                ? tools
                      .map(
                          (t) =>
                              `### ${t.displayName} (\`${t.name}\`)\n${t.description}${t.requiresConfirmation ? '\n> ⚠️ Esta herramienta requiere confirmación del usuario antes de ejecutarse.' : ''}`
                      )
                      .join('\n\n')
                : 'No hay herramientas especiales disponibles en esta actividad.';

        const ragSection = ragContext
            ? `## Contexto del material del curso\n\nUtiliza la siguiente información de los documentos del curso como referencia prioritaria:\n\n[[CONTEXTO_RAG]]\n${ragContext}\n[[FIN_CONTEXTO_RAG]]`
            : '';

        let prompt = config.systemPrompt || this.BASE_TEMPLATE;

        return prompt
            .replace(/{role}/g, role)
            .replace(/{instructions}/g, instructions)
            .replace(/{context}/g, context)
            .replace(/{tools_section}/g, toolsSection)
            .replace(/{rag_section}/g, ragSection);
    }
}
