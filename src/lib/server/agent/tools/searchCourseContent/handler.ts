import { RagService } from '$lib/server/ai/services/RagService';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface SearchParams {
    query: string;
    topK?: number;
}

export async function searchCourseContent(
    params: SearchParams,
    context: AgentContext
): Promise<ToolResult> {
    const start = Date.now();

    const agentConfig = context.activityConfig;

    if (!agentConfig.ragEnabled || !agentConfig.ragCollectionName) {
        return {
            success: false,
            data: { documents: [], totalFound: 0 },
            displayText: 'La actividad no tiene documentos de curso indexados.',
            durationMs: Date.now() - start
        };
    }

    try {
        let ragConfig: Record<string, unknown> = {};
        if (agentConfig.ragConfig) {
            try {
                ragConfig = JSON.parse(agentConfig.ragConfig) as Record<string, unknown>;
            } catch {
                // use defaults
            }
        }

        const topK = params.topK ?? (typeof ragConfig.topK === 'number' ? ragConfig.topK : 5);
        const minScore =
            typeof ragConfig.minScore === 'number' ? ragConfig.minScore : 0.7;

        const result = await RagService.getRagContext(
            params.query,
            agentConfig.ragCollectionName,
            topK,
            minScore
        );

        const documents = result
            ? result.sources.map((s: { source: string; score: number }) => ({
                  content: result.context,
                  source: s.source,
                  score: s.score
              }))
            : [];

        return {
            success: true,
            data: {
                documents,
                totalFound: documents.length,
                rawContext: result?.context
            },
            displayText:
                documents.length > 0
                    ? `Encontré ${documents.length} fragmento(s) relevante(s) en los documentos del curso.`
                    : 'No encontré contenido relevante en los documentos del curso.',
            durationMs: Date.now() - start
        };
    } catch (error) {
        return {
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Error al buscar en el curso',
            durationMs: Date.now() - start
        };
    }
}
