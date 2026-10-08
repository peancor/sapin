import 'dotenv/config';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, generateText, tool } from 'ai';
import { z } from 'zod';
import sharp from 'sharp';
import { QdrantClient } from '@qdrant/js-client-rest';
import { generateEmbedding } from '../src/lib/server/qdrant/embeddings';

// Opt-in only: tiny paid calls with fabricated content, no application DB writes.
if (!process.argv.includes('--live'))
	throw new Error('Usa --live para autorizar las llamadas externas.');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
const source = new Database(process.env.DATABASE_URL, { readonly: true, fileMustExist: true });
const model = source
	.prepare(
		`SELECT m.name, p.api_key AS apiKey FROM ai_model m
 JOIN ai_provider p ON p.id = m.provider_id
 WHERE m.is_active=1 AND p.is_active=1 AND p.type='openrouter'
 AND length(p.api_key)>0 AND m.capabilities LIKE '%vision%'
 ORDER BY m.input_price_per_million ASC LIMIT 1`
	)
	.get() as { name: string; apiKey: string } | undefined;
source.close();
if (!model) throw new Error('No hay modelo OpenRouter activo con visión.');
const provider = createOpenRouter({ apiKey: model.apiKey });
const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ff0000' } })
	.png()
	.toBuffer();
const stream = streamText({
	model: provider.chat(model.name),
	maxOutputTokens: 96,
	maxRetries: 0,
	abortSignal: AbortSignal.timeout(60_000),
	messages: [
		{
			role: 'user',
			content: [
				{
					type: 'text',
					text: 'Prueba técnica con imagen ficticia: responde solo con el color de esta imagen.'
				},
				{ type: 'image', image }
			]
		}
	]
});
let answer = '';
for await (const part of stream.textStream) answer += part;
assert.match(answer.toLowerCase(), /rojo|red/);
console.log('PASS: streaming e imagen con proveedor real; modelo', model.name);
const result = await generateText({
	model: provider.chat(model.name),
	maxOutputTokens: 128,
	maxRetries: 0,
	abortSignal: AbortSignal.timeout(60_000),
	prompt: 'Usa sum para sumar 2 y 3.',
	toolChoice: { type: 'tool', toolName: 'sum' },
	tools: {
		sum: tool({
			description: 'Suma ficticia sin efectos secundarios',
			inputSchema: z.object({ a: z.number(), b: z.number() }),
			execute: async ({ a, b }) => a + b
		})
	}
});
assert.equal(result.toolResults[0]?.output, 5);
console.log('PASS: llamada y ejecución de herramienta con proveedor real');

const url = process.env.TEST_QDRANT_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
	throw new Error('TEST_QDRANT_URL debe apuntar a una instancia local de pruebas.');
const qdrant = new QdrantClient({ url });
const collection = `sapin_smoke_${randomUUID().replaceAll('-', '')}`;
let created = false;
try {
	const vector = await generateEmbedding('La capital ficticia del planeta Sapin es Roble.');
	assert.ok(vector.length > 0);
	await qdrant.createCollection(collection, {
		vectors: { size: vector.length, distance: 'Cosine' }
	});
	created = true;
	await qdrant.upsert(collection, {
		wait: true,
		points: [
			{ id: 1, vector, payload: { text: 'La capital ficticia del planeta Sapin es Roble.' } }
		]
	});
	const query = await generateEmbedding('¿Cuál es la capital del planeta Sapin?');
	const hits = await qdrant.search(collection, { vector: query, limit: 1, with_payload: true });
	assert.equal(hits[0]?.id, 1);
	assert.match(String(hits[0]?.payload?.text), /Roble/);
	console.log('PASS: embeddings reales, indexación y recuperación con Qdrant');
} finally {
	if (created) await qdrant.deleteCollection(collection);
}
