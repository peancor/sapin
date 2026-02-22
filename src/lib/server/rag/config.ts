export type RagConfig = {
	chunkSize: number;
	chunkOverlap: number;
	topK: number;
	minScore: number;
	contextMaxChars: number;
	mergeAdjacentChunks: boolean;
	adjacencyWindow: number;
	perSourceMaxBlocks: number;
	fallbackMinScore: number;
};

export const DEFAULT_RAG_CONFIG: RagConfig = {
	chunkSize: 6000,
	chunkOverlap: 200,
	topK: 5,
	minScore: 0.55,
	contextMaxChars: 18000,
	mergeAdjacentChunks: true,
	adjacencyWindow: 0,
	perSourceMaxBlocks: 3,
	fallbackMinScore: 0.45
};

function parseObject(value: unknown): Record<string, unknown> {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}

	if (typeof value === 'string' && value.trim().length > 0) {
		try {
			const parsed = JSON.parse(value);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return {};
		}
	}

	return {};
}

function pickFiniteNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		if (value === 'true') return true;
		if (value === 'false') return false;
	}
	return fallback;
}

export function resolveRagConfig(ragConfig: unknown): RagConfig {
	const parsedConfig = parseObject(ragConfig);

	return {
		chunkSize: pickFiniteNumber(parsedConfig.chunkSize, DEFAULT_RAG_CONFIG.chunkSize),
		chunkOverlap: pickFiniteNumber(parsedConfig.chunkOverlap, DEFAULT_RAG_CONFIG.chunkOverlap),
		topK: pickFiniteNumber(parsedConfig.topK, DEFAULT_RAG_CONFIG.topK),
		minScore: pickFiniteNumber(parsedConfig.minScore, DEFAULT_RAG_CONFIG.minScore),
		contextMaxChars: pickFiniteNumber(parsedConfig.contextMaxChars, DEFAULT_RAG_CONFIG.contextMaxChars),
		mergeAdjacentChunks: pickBoolean(
			parsedConfig.mergeAdjacentChunks,
			DEFAULT_RAG_CONFIG.mergeAdjacentChunks
		),
		adjacencyWindow: pickFiniteNumber(parsedConfig.adjacencyWindow, DEFAULT_RAG_CONFIG.adjacencyWindow),
		perSourceMaxBlocks: pickFiniteNumber(
			parsedConfig.perSourceMaxBlocks,
			DEFAULT_RAG_CONFIG.perSourceMaxBlocks
		),
		fallbackMinScore: pickFiniteNumber(
			parsedConfig.fallbackMinScore,
			DEFAULT_RAG_CONFIG.fallbackMinScore
		)
	};
}
