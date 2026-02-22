import { EMBEDDINGS_OPENROUTER_API_KEY } from '$env/static/private';
import { buildOpenRouterHeaders } from '$lib/server/utils/openRouter';

// Gemini embedding model configuration
const GEMINI_EMBEDDING_MODEL = 'google/gemini-embedding-001';
const GEMINI_EMBEDDING_DIMENSIONS = 3072;
const EMBEDDINGS_BATCH_SIZE = 48;

type EmbeddingApiItem = {
    index: number;
    embedding: number[];
};

async function requestEmbeddings(input: string | string[]): Promise<number[][]> {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: buildOpenRouterHeaders(EMBEDDINGS_OPENROUTER_API_KEY, 'SAPIN Embeddings'),
        body: JSON.stringify({
            model: GEMINI_EMBEDDING_MODEL,
            input
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter Embeddings API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    if (!result?.data || !Array.isArray(result.data)) {
        const keys = result && typeof result === 'object' ? Object.keys(result).join(', ') : 'no-data';
        throw new Error(`Invalid embedding response (missing data array). Keys: ${keys}`);
    }

    return (result.data as EmbeddingApiItem[])
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
}

/**
 * Generate embeddings using OpenRouter with Google Gemini Embedding model
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    if (!EMBEDDINGS_OPENROUTER_API_KEY) {
        throw new Error('EMBEDDINGS_OPENROUTER_API_KEY not configured in environment');
    }

    const embeddings = await requestEmbeddings(text);
    if (!embeddings[0]) {
        throw new Error('Invalid embedding response (empty embedding array)');
    }
    return embeddings[0];
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!EMBEDDINGS_OPENROUTER_API_KEY) {
        throw new Error('EMBEDDINGS_OPENROUTER_API_KEY not configured in environment');
    }

    if (texts.length === 0) return [];

    const allEmbeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBEDDINGS_BATCH_SIZE) {
        const batch = texts.slice(start, start + EMBEDDINGS_BATCH_SIZE);
        const embeddings = await requestEmbeddings(batch);

        if (embeddings.length !== batch.length) {
            throw new Error(
                `Invalid embedding response (batch mismatch). Expected ${batch.length}, got ${embeddings.length}`
            );
        }

        allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
}

/**
 * Get embedding model info
 */
export function getEmbeddingModelInfo() {
    return {
        model: GEMINI_EMBEDDING_MODEL,
        dimensions: GEMINI_EMBEDDING_DIMENSIONS,
        provider: 'OpenRouter (Google Gemini)'
    };
}

export { GEMINI_EMBEDDING_MODEL, GEMINI_EMBEDDING_DIMENSIONS };
