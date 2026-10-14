import { z } from 'zod';
import type { RadarActionDataset, RadarActionSnapshot } from '$lib/types/radarActions';
import { radarIntents, radarIntentLabels } from '$lib/types/radar';
import { RadarError } from './RadarRepository';

export const actionSchema = z
	.object({
		name: z.string().trim().min(1).max(80),
		prompt: z.string().trim().min(1).max(4000),
		scope: z.enum(['activity', 'course']),
		window: z.enum(['all', 'recent', 'compare']),
		minutes: z.number().int().min(1).max(120),
		presentation: z.enum(['auto', 'text', 'statistics', 'table', 'bar', 'line'])
	})
	.strict();
export const actionPatchSchema = actionSchema.extend({ revision: z.number().int().positive() });
export const executeActionSchema = z
	.object({
		actionId: z.string().min(1).max(100),
		revision: z.number().int().positive(),
		requestId: z.string().uuid()
	})
	.strict();
const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
export const actionPlanSchema = z.object({
	queries: z
		.array(
			z.object({
				id: identifier,
				groupBy: z.enum(['total', 'topics', 'intents', 'minute']),
				metric: z.enum(['messages', 'students', 'confusions']),
				topicIds: z.array(z.string()).refine((rows) => rows.length <= 20),
				intents: z.array(z.enum(radarIntents)).refine((rows) => rows.length <= 8)
			})
		)
		.min(1)
		.refine((rows) => rows.length <= 6),
	calculations: z
		.array(
			z.object({
				id: identifier,
				operation: z.enum(['percent', 'ratio', 'difference', 'sum', 'mean']),
				left: identifier,
				right: identifier
			})
		)
		.refine((rows) => rows.length <= 4),
	limitations: z.array(z.string().max(300)).refine((rows) => rows.length <= 5)
});
export const actionReportSchema = z.object({
	text: z.string().max(10000),
	evidenceIds: z.array(z.string()).refine((rows) => rows.length <= 12),
	blocks: z
		.array(
			z.object({ datasetId: identifier, kind: z.enum(['statistics', 'table', 'bar', 'line']) })
		)
		.refine((rows) => rows.length <= 8)
});
export type ActionPlan = z.infer<typeof actionPlanSchema>;
type Row = RadarActionSnapshot['observations'][number];
const metrics = {
	messages: 'Mensajes',
	students: 'Estudiantes distintos',
	confusions: 'Mensajes con posible confusión'
};

/** All displayed numbers originate here, never in model-produced chart options. */
export function computeActionDatasets(
	snapshot: RadarActionSnapshot,
	plan: ActionPlan
): RadarActionDataset[] {
	const ids = new Set<string>();
	const topicNames = new Map(snapshot.topics.map((t) => [t.id, t.title]));
	const datasets: RadarActionDataset[] = [];
	const claimId = (id: string) => {
		if (ids.has(id)) throw new RadarError(422, 'El análisis ha repetido un identificador.');
		ids.add(id);
	};
	const current = snapshot.observations.filter((r) => r.at >= snapshot.from && r.at <= snapshot.to);
	const previous = snapshot.previousFrom
		? snapshot.observations.filter((r) => r.at >= snapshot.previousFrom! && r.at < snapshot.from)
		: [];
	for (const query of plan.queries) {
		claimId(query.id);
		if (query.topicIds.some((id) => !topicNames.has(id)))
			throw new RadarError(422, 'El análisis ha solicitado un tema ajeno a la instantánea.');
		const filter = (rows: Row[]) =>
			rows.filter(
				(r) =>
					(!query.topicIds.length || r.topicIds.some((id) => query.topicIds.includes(id))) &&
					(!query.intents.length || (!!r.intent && query.intents.includes(r.intent)))
			);
		const curr = filter(current),
			prev = filter(previous);
		const count = (rows: Row[]) =>
			query.metric === 'students'
				? new Set(rows.map((r) => r.student)).size
				: query.metric === 'confusions'
					? rows.filter((r) => r.confusion).length
					: rows.length;
		const groups = new Map<string, string>();
		if (query.groupBy === 'total') groups.set('total', 'Total');
		if (query.groupBy === 'topics')
			for (const t of snapshot.topics)
				if (!query.topicIds.length || query.topicIds.includes(t.id)) groups.set(t.id, t.title);
		if (query.groupBy === 'intents')
			for (const intent of radarIntents)
				if (!query.intents.length || query.intents.includes(intent))
					groups.set(intent, radarIntentLabels[intent]);
		// Relative minute buckets align equal-duration comparison windows, including empty buckets.
		if (query.groupBy === 'minute')
			for (
				let i = 0;
				i <= Math.floor((Date.parse(snapshot.to) - Date.parse(snapshot.from)) / 60000);
				i++
			)
				groups.set(String(i), `Minuto ${i + 1}`);
		const bucket = (rows: Row[], key: string, start: string) =>
			rows.filter(
				(r) =>
					query.groupBy === 'total' ||
					(query.groupBy === 'topics' && r.topicIds.includes(key)) ||
					(query.groupBy === 'intents' && r.intent === key) ||
					(query.groupBy === 'minute' &&
						Math.floor((Date.parse(r.at) - Date.parse(start)) / 60000) === Number(key))
			);
		const filterDescription = [
			query.topicIds.length
				? `Temas: ${query.topicIds.map((id) => topicNames.get(id)).join(', ')}.`
				: '',
			query.intents.length
				? `Intenciones: ${query.intents.map((i) => radarIntentLabels[i]).join(', ')}.`
				: ''
		]
			.filter(Boolean)
			.join(' ');
		datasets.push({
			id: query.id,
			title: `${metrics[query.metric]} · ${{ total: 'total', topics: 'por tema', intents: 'por intención', minute: 'por minuto' }[query.groupBy]}`,
			unit: query.metric === 'students' ? 'estudiantes' : 'mensajes',
			definition: `${metrics[query.metric]} en el intervalo. ${filterDescription} ${query.groupBy === 'topics' ? 'Un mensaje puede pertenecer a varios temas; las filas no son aditivas.' : ''} Las categorías y posibles confusiones solo incluyen mensajes ya clasificados.`,
			rows: [...groups].map(([key, label]) => {
				const rows = bucket(curr, key, snapshot.from);
				return {
					key,
					label,
					value: count(rows),
					previous: snapshot.previousFrom ? count(bucket(prev, key, snapshot.previousFrom)) : null,
					evidenceIds: rows
						.filter((r) => query.metric !== 'confusions' || r.confusion)
						.slice(0, 10)
						.map((r) => r.id)
				};
			})
		});
	}
	for (const calculation of plan.calculations) {
		claimId(calculation.id);
		const left = datasets.find((d) => d.id === calculation.left),
			right = datasets.find((d) => d.id === calculation.right);
		if (!left || !right || left.rows.length !== 1 || right.rows.length !== 1)
			throw new RadarError(422, 'Los cálculos requieren dos conjuntos de un único valor.');
		if (['difference', 'sum', 'mean'].includes(calculation.operation) && left.unit !== right.unit)
			throw new RadarError(422, 'No se pueden combinar magnitudes con unidades distintas.');
		const calculate = (a: number | null, b: number | null) => {
			if (a === null || b === null) return null;
			switch (calculation.operation) {
				case 'percent':
					return b === 0 ? null : (a / b) * 100;
				case 'ratio':
					return b === 0 ? null : a / b;
				case 'difference':
					return a - b;
				case 'sum':
					return a + b;
				case 'mean':
					return (a + b) / 2;
			}
		};
		const label = {
			percent: 'Porcentaje',
			ratio: 'Cociente',
			difference: 'Diferencia',
			sum: 'Suma',
			mean: 'Media de dos valores'
		}[calculation.operation];
		datasets.push({
			id: calculation.id,
			title: `${label}: ${left.title} / ${right.title}`,
			unit:
				calculation.operation === 'percent'
					? '%'
					: calculation.operation === 'ratio'
						? `${left.unit}/${right.unit}`
						: left.unit,
			definition: `${label} entre «${left.title}» y «${right.title}». Un denominador cero se muestra sin valor.`,
			rows: [
				{
					key: 'total',
					label,
					value: calculate(left.rows[0].value, right.rows[0].value),
					previous: calculate(left.rows[0].previous, right.rows[0].previous),
					evidenceIds: [
						...new Set([...left.rows[0].evidenceIds, ...right.rows[0].evidenceIds])
					].slice(0, 10)
				}
			]
		});
	}
	return datasets;
}
