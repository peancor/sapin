import { collectionExists, searchPoints } from '$lib/server/qdrant';
import { generateEmbedding } from '$lib/server/qdrant/embeddings';

export type RagSource = { source: string; score: number };

type RagPayload = {
	content: string;
	source?: string;
	chunkIndex?: number;
	totalChunks?: number;
};

type RagItem = {
	id: string | number;
	score: number;
	source: string;
	chunkIndex?: number;
	totalChunks?: number;
	content: string;
};

type RagBlock = {
	source: string;
	scoreMax: number;
	chunkStart?: number;
	chunkEnd?: number;
	totalChunks?: number;
	text: string;
};

export type RagContextOptions = {
	maxChars?: number;
	mergeAdjacentChunks?: boolean;
	adjacencyWindow?: number;
	perSourceMaxBlocks?: number;
	fallbackMinScore?: number;
};

function approxTokensFromChars(chars: number) {
	return Math.ceil(chars / 4);
}

function cleanText(content: string) {
	return (content ?? '')
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function parseFiniteNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function normalizeResults(results: Array<{ id: string | number; score: number; payload?: unknown }>): RagItem[] {
	const normalized: Array<RagItem | null> = results
		.map((result) => {
			const payload = (result.payload ?? null) as RagPayload | null;
			if (!payload?.content) return null;

			const content = cleanText(String(payload.content));
			if (!content) return null;

			const source = (payload.source ? String(payload.source) : 'Documento').trim() || 'Documento';

			return {
				id: result.id,
				score: result.score,
				source,
				chunkIndex: parseFiniteNumber(payload.chunkIndex),
				totalChunks: parseFiniteNumber(payload.totalChunks),
				content
			};
		});

	return normalized.filter((item): item is RagItem => item !== null);
}

function buildBlocks(itemsBySource: Map<string, RagItem[]>, options: Required<RagContextOptions>): RagBlock[] {
	const blocks: RagBlock[] = [];

	for (const [source, items] of itemsBySource.entries()) {
		const sorted = [...items].sort((a, b) => {
			const ai = a.chunkIndex ?? Number.POSITIVE_INFINITY;
			const bi = b.chunkIndex ?? Number.POSITIVE_INFINITY;
			if (ai !== bi) return ai - bi;
			return b.score - a.score;
		});

		const localBlocks: RagBlock[] = [];

		if (!options.mergeAdjacentChunks || sorted.every((item) => item.chunkIndex === undefined)) {
			for (const item of sorted) {
				localBlocks.push({
					source,
					scoreMax: item.score,
					chunkStart: item.chunkIndex,
					chunkEnd: item.chunkIndex,
					totalChunks: item.totalChunks,
					text: item.content
				});
			}
		} else {
			let current: RagBlock | null = null;

			for (const item of sorted) {
				if (current === null) {
					current = {
						source,
						scoreMax: item.score,
						chunkStart: item.chunkIndex,
						chunkEnd: item.chunkIndex,
						totalChunks: item.totalChunks,
						text: item.content
					};
					continue;
				}

				const canMerge =
					current.chunkEnd !== undefined &&
					item.chunkIndex !== undefined &&
					item.chunkIndex <= current.chunkEnd + 1 + options.adjacencyWindow;

				if (canMerge) {
					current.scoreMax = Math.max(current.scoreMax, item.score);
					current.chunkEnd = item.chunkIndex;
					current.totalChunks = current.totalChunks ?? item.totalChunks;
					current.text = cleanText(`${current.text}\n\n${item.content}`);
					continue;
				}

				localBlocks.push(current);
				current = {
					source,
					scoreMax: item.score,
					chunkStart: item.chunkIndex,
					chunkEnd: item.chunkIndex,
					totalChunks: item.totalChunks,
					text: item.content
				};
			}

			if (current) {
				localBlocks.push(current);
			}
		}

		localBlocks.sort((a, b) => b.scoreMax - a.scoreMax);
		blocks.push(...localBlocks.slice(0, options.perSourceMaxBlocks));
	}

	return blocks.sort((a, b) => b.scoreMax - a.scoreMax);
}

function buildContext(blocks: RagBlock[], maxChars: number): { context: string; usedChars: number } {
	const contextParts: string[] = [];
	let used = 0;

	for (const block of blocks) {
		const range =
			block.chunkStart !== undefined && block.chunkEnd !== undefined
				? `chunks ${block.chunkStart + 1}-${block.chunkEnd + 1}${block.totalChunks ? `/${block.totalChunks}` : ''}`
				: 'chunk';

		const header = `### Fuente: ${block.source} (${range}) | score=${block.scoreMax.toFixed(3)}\n`;
		const piece = `${header}${block.text}\n`;

		if (used + piece.length > maxChars) {
			const remaining = maxChars - used;
			if (remaining > header.length + 200) {
				const truncatedBody = block.text.slice(0, Math.max(0, remaining - header.length - 20)).trimEnd();
				contextParts.push(`${header}${truncatedBody}\n...`);
				used = maxChars;
			}
			break;
		}

		contextParts.push(piece);
		used += piece.length;
	}

	return { context: contextParts.join('\n').trim(), usedChars: used };
}

export class RagService {
	public static async getRagContext(
		query: string,
		collectionName: string,
		topK: number = 5,
		minScore: number = 0.7,
		opts?: RagContextOptions
	): Promise<{ context: string; sources: RagSource[] } | null> {
		const options: Required<RagContextOptions> = {
			maxChars: opts?.maxChars ?? 6000,
			mergeAdjacentChunks: opts?.mergeAdjacentChunks ?? true,
			adjacencyWindow: opts?.adjacencyWindow ?? 0,
			perSourceMaxBlocks: opts?.perSourceMaxBlocks ?? 3,
			fallbackMinScore: opts?.fallbackMinScore ?? 0.45
		};

		try {
			const exists = await collectionExists(collectionName);
			if (!exists) {
				console.log(`[RAG] Collection ${collectionName} does not exist`);
				return null;
			}

			const queryEmbedding = await generateEmbedding(query);
			const searchResult = await searchPoints(collectionName, queryEmbedding, topK);

			if (!searchResult.success || !searchResult.results?.length) {
				console.log(`[RAG] No results found for query in ${collectionName}`);
				return null;
			}

			console.log(
				'[RAG] topK raw scores:',
				searchResult.results.map((result) => result.score)
			);

			let filtered = searchResult.results.filter(
				(result) => typeof result.score === 'number' && result.score >= minScore
			);

			if (filtered.length === 0) {
				const top1 = searchResult.results[0];
				if (top1 && top1.score >= options.fallbackMinScore) {
					console.log(
						`[RAG] No results above minScore=${minScore}. Falling back to top1 score=${top1.score}`
					);
					filtered = [top1];
				} else {
					console.log(`[RAG] No results above minScore ${minScore}`);
					return null;
				}
			}

			const normalized = normalizeResults(
				filtered as Array<{ id: string | number; score: number; payload?: unknown }>
			);
			if (normalized.length === 0) return null;

			const bySource = new Map<string, RagItem[]>();
			for (const item of normalized) {
				const existing = bySource.get(item.source) ?? [];
				existing.push(item);
				bySource.set(item.source, existing);
			}

			const sources: RagSource[] = [...bySource.entries()]
				.map(([source, items]) => ({
					source,
					score: Math.max(...items.map((item) => item.score))
				}))
				.sort((a, b) => b.score - a.score);

			const blocks = buildBlocks(bySource, options);
			const { context, usedChars } = buildContext(blocks, options.maxChars);

			console.log('[RAG] Built context', {
				collectionName,
				blocks: blocks.length,
				usedChars,
				approxTokens: approxTokensFromChars(usedChars),
				topK,
				minScore
			});

			if (!context) return null;
			return { context, sources };
		} catch (error) {
			console.error('[RAG] Error getting RAG context:', error);
			return null;
		}
	}
}
