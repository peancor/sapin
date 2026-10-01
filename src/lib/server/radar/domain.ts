import { z } from 'zod';
import {
	radarIntents,
	type RadarSnapshot,
	type RadarTopicView,
	type RadarWindow
} from '$lib/types/radar';

export const ANALYZER_VERSION = 'radar-1';
export const RECENT_MS = 5 * 60_000;
export const createRunSchema = z
	.object({
		title: z.string().trim().min(1).max(160),
		durationMinutes: z.number().int().min(15).max(240).default(90),
		modelId: z.string().min(1).max(200),
		context: z.string().trim().max(6000).optional()
	})
	.strict();
export const patchRunSchema = z
	.object({
		title: z.string().trim().min(1).max(160).optional(),
		endsAt: z.iso.datetime().optional()
	})
	.strict()
	.refine(
		(value) => value.title !== undefined || value.endsAt !== undefined,
		'Indica un título o una nueva hora de fin.'
	);
export const extractionSchema = z.object({
	observations: z
		.array(
			z.object({
				id: z.string(),
				intent: z.enum(radarIntents),
				topics: z
					.array(
						z.object({
							existingId: z.string().nullable(),
							title: z.string().max(140),
							description: z.string().max(600)
						})
					)
					.max(3),
				confusion: z.string().max(600).nullable(),
				evidenceIds: z.array(z.string()).max(7),
				insufficientContext: z.boolean()
			})
		)
		.max(50)
});
export const synthesisSchema = z.object({
	summary: z.string().max(1800),
	clarifications: z
		.array(
			z.object({
				topicId: z.string(),
				suggestion: z.string().max(600),
				evidenceIds: z.array(z.string()).min(1).max(5)
			})
		)
		.max(8)
});
export type Extraction = z.infer<typeof extractionSchema>;
export type Synthesis = z.infer<typeof synthesisSchema>;
export interface RadarInput {
	id: string;
	student: string;
	text: string;
	truncated: boolean;
	context: { id: string; role: 'user' | 'assistant'; text: string }[];
}
export function normalizeTitle(title: string): string {
	return title
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}
export function isInternal(text: string | null): boolean {
	return /^\[\[.*\]\]$/s.test((text ?? '').trim());
}

/** The learner message itself must support every inferred confusion. Context is not classroom evidence. */
export function validateExtraction(
	result: Extraction,
	input: RadarInput[],
	topicIds: Set<string>
): Extraction {
	const byId = new Map(input.map((item) => [item.id, item]));
	const seen = new Set<string>();
	for (const row of result.observations) {
		const source = byId.get(row.id);
		if (!source || seen.has(row.id))
			throw new Error('Respuesta incompatible: observación ajena o duplicada.');
		seen.add(row.id);
		const allowed = new Set([row.id, ...source.context.map((c) => c.id)]);
		if (row.evidenceIds.some((id) => !allowed.has(id)))
			throw new Error('Respuesta incompatible: evidencia ajena al mensaje.');
		if (
			row.topics.some((t) =>
				t.existingId ? !topicIds.has(t.existingId) : !normalizeTitle(t.title)
			)
		)
			throw new Error('Respuesta incompatible: tema desconocido o vacío.');
		if (row.confusion && !row.evidenceIds.includes(row.id))
			throw new Error('Respuesta incompatible: confusión sin evidencia del estudiante.');
		if (row.intent === 'social' && (row.topics.length || row.confusion))
			throw new Error('Respuesta incompatible: cierre social convertido en duda.');
	}
	if (seen.size !== input.length)
		throw new Error('Respuesta incompleta: faltan observaciones del lote.');
	return result;
}

export interface AggregateObservation {
	id: string;
	studentId: string;
	at: Date;
	status: string;
	intent: (typeof radarIntents)[number] | null;
	confusion: string | null;
	truncated: boolean;
}
export function statistics(
	rows: AggregateObservation[],
	startsAt: Date,
	endpoint: Date
): RadarSnapshot['statistics'] {
	const recentStart = endpoint.getTime() - RECENT_MS;
	const counts = new Map<string, number>();
	const minutes = new Map<number, number>();
	for (let t = Math.floor(+startsAt / 60000) * 60000; t <= +endpoint; t += 60000) minutes.set(t, 0);
	for (const row of rows) {
		counts.set(row.studentId, (counts.get(row.studentId) ?? 0) + 1);
		const minute = Math.floor(+row.at / 60000) * 60000;
		minutes.set(minute, (minutes.get(minute) ?? 0) + 1);
	}
	const distribution = new Map<number, number>();
	for (const count of counts.values()) distribution.set(count, (distribution.get(count) ?? 0) + 1);
	return {
		students: counts.size,
		recentStudents: new Set(rows.filter((r) => +r.at >= recentStart).map((r) => r.studentId)).size,
		messages: rows.length,
		perMinute: [...minutes]
			.sort(([a], [b]) => a - b)
			.map(([at, messages]) => ({ at: new Date(at).toISOString(), messages })),
		distribution: [...distribution]
			.sort(([a], [b]) => a - b)
			.map(([messages, students]) => ({ messages, students })),
		coverage: {
			processed: rows.filter((r) => r.status === 'processed').length,
			pending: rows.filter((r) => r.status === 'pending').length,
			notAnalyzable: rows.filter((r) => r.status === 'not_analyzable').length,
			truncated: rows.filter((r) => r.truncated).length
		}
	};
}
export function aggregateTopics(
	topics: {
		id: string;
		title: string;
		description: string;
		suggestion: string | null;
		suggestionEvidence?: string[] | null;
	}[],
	links: { observationId: string; topicId: string }[],
	rows: AggregateObservation[],
	window: RadarWindow,
	startsAt: Date,
	endpoint: Date
): RadarTopicView[] {
	const byId = new Map(rows.map((r) => [r.id, r]));
	const grouped = new Map<string, AggregateObservation[]>();
	for (const link of links) {
		const row = byId.get(link.observationId);
		if (row) {
			const list = grouped.get(link.topicId) ?? [];
			list.push(row);
			grouped.set(link.topicId, list);
		}
	}
	return topics
		.flatMap((topic) => {
			const all = grouped.get(topic.id) ?? [];
			const selected = all.filter((r) => window === 'all' || +r.at >= +endpoint - RECENT_MS);
			if (!selected.length) return [];
			const intents: RadarTopicView['intents'] = {};
			for (const row of selected)
				if (row.intent) intents[row.intent] = (intents[row.intent] ?? 0) + 1;
			const current = all.filter((r) => +r.at >= +endpoint - RECENT_MS).length;
			const previous = all.filter(
				(r) => +r.at >= +endpoint - 2 * RECENT_MS && +r.at < +endpoint - RECENT_MS
			).length;
			return [
				{
					...topic,
					suggestion: topic.suggestionEvidence?.some((id) => selected.some((row) => row.id === id))
						? topic.suggestion
						: null,
					students: new Set(selected.map((r) => r.studentId)).size,
					messages: selected.length,
					firstAt: new Date(Math.min(...selected.map((r) => +r.at))).toISOString(),
					lastAt: new Date(Math.max(...selected.map((r) => +r.at))).toISOString(),
					intents,
					confusionCount: selected.filter((r) => r.confusion).length,
					trend:
						+endpoint - +startsAt >= 2 * RECENT_MS
							? {
									current,
									previous,
									percent: previous ? Math.round(((current - previous) / previous) * 100) : null
								}
							: null
				}
			];
		})
		.sort((a, b) => b.students - a.students || b.messages - a.messages || a.id.localeCompare(b.id));
}
