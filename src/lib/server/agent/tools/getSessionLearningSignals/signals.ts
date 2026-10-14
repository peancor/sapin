import { and, asc, eq, sql } from 'drizzle-orm';
import type { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { AgentContext } from '$lib/types/agent';

export interface SessionSignalsParams {
	scope?: 'latest' | 'recent' | 'session';
	limit?: number;
}

const metricKeys = [
	'pasteCount',
	'keystrokeCount',
	'editCount',
	'deleteCount',
	'charCount',
	'wordCount',
	'timeSpentSeconds'
] as const;
type MetricKey = (typeof metricKeys)[number];
type Metrics = Record<MetricKey, number | null>;
type Message = { id: string; createdAt: Date; textContent: string | null; metadata: string | null };

function parseMetrics(metadata: string | null): Metrics {
	let value: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(metadata ?? 'null');
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			value = parsed as Record<string, unknown>;
		}
	} catch {
		/* Malformed telemetry is unavailable, not zero. */
	}
	return Object.fromEntries(
		metricKeys.map((key) => {
			const number = value[key];
			return [
				key,
				typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : null
			];
		})
	) as Metrics;
}

export function buildSessionSignals(rows: Message[], params: SessionSignalsParams) {
	const scope = params.scope ?? 'latest';
	const eligible = rows.filter((row) => !/^\[\[.*\]\]$/s.test(row.textContent?.trim() ?? ''));
	const selected =
		scope === 'session'
			? eligible
			: eligible.slice(-(scope === 'latest' ? 1 : (params.limit ?? 5)));
	const messages = selected.map((row) => ({
		messageId: row.id,
		createdAt: row.createdAt.toISOString(),
		metrics: parseMetrics(row.metadata)
	}));
	const metrics = Object.fromEntries(
		metricKeys.map((key) => {
			const values = messages
				.map((message) => message.metrics[key])
				.filter((value): value is number => value !== null);
			const sum = values.reduce((total, value) => total + value, 0);
			return [
				key,
				{
					total: values.length && Number.isSafeInteger(sum) ? sum : null,
					observedMessages: values.length,
					missingMessages: messages.length - values.length
				}
			];
		})
	);
	return {
		scope,
		messageCount: messages.length,
		messagesWithMetrics: messages.filter((message) =>
			metricKeys.some((key) => message.metrics[key] !== null)
		).length,
		metrics,
		messages: scope === 'session' ? [] : messages,
		limitations: [
			'Datos enviados por el cliente, no verificados; ausentes o inválidos se representan como null. Los totales suman solo valores disponibles.',
			'pasteCount cuenta eventos de pegado, no caracteres pegados ni su origen. No se registran copias ni contenido del portapapeles.',
			'timeSpentSeconds es tiempo transcurrido del borrador e incluye pausas; no mide tiempo de escritura activa.',
			'Las pulsaciones no equivalen a caracteres escritos y dependen del método de entrada. Estas métricas no prueban autoría, esfuerzo o comprensión.',
			'Solo incluye mensajes de usuario enviados, excluidos los disparadores internos. No observa borradores en curso.'
		]
	};
}

export async function readSessionSignals(
	database: typeof db,
	context: AgentContext,
	params: SessionSignalsParams
) {
	const [relation] = await database
		.select({ id: schema.chat.id })
		.from(schema.chat)
		.innerJoin(
			schema.userInteractiveLearningChat,
			eq(schema.userInteractiveLearningChat.chatId, schema.chat.id)
		)
		.where(
			and(
				eq(schema.chat.id, context.chatId),
				eq(schema.chat.userId, context.userId),
				eq(schema.userInteractiveLearningChat.userId, context.userId),
				eq(schema.userInteractiveLearningChat.interactiveLearningChatId, context.activityId)
			)
		)
		.limit(1);
	if (!relation)
		throw new Error('La conversación no pertenece al usuario y a la actividad del contexto.');
	const rows = await database
		.select({
			id: schema.agentMessage.id,
			createdAt: schema.agentMessage.createdAt,
			textContent: schema.agentMessage.textContent,
			metadata: schema.agentMessage.metadata
		})
		.from(schema.agentMessage)
		.where(
			and(eq(schema.agentMessage.chatId, context.chatId), eq(schema.agentMessage.role, 'user'))
		)
		// SQLite timestamps have second precision; rowid preserves insertion order for ties.
		.orderBy(asc(schema.agentMessage.createdAt), asc(sql`${schema.agentMessage}.rowid`));
	return buildSessionSignals(rows, params);
}
