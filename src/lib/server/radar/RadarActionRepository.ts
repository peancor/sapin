import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { aiModel, aiUsageLog, radarAction, radarActionExecution } from '$lib/server/db/schema';
import type {
	RadarAction,
	RadarActionInput,
	RadarActionExecution,
	RadarActionSnapshot
} from '$lib/types/radarActions';
import { RadarError, type RadarRepository } from './RadarRepository';

export type ActionExecutionRow = typeof radarActionExecution.$inferSelect;
export class RadarActionRepository {
	public radar: RadarRepository;
	constructor(radar: RadarRepository) {
		this.radar = radar;
	}
	get database() {
		return this.radar.database;
	}
	private scope(courseId: string, activityId: string) {
		return and(
			eq(radarAction.courseId, courseId),
			or(isNull(radarAction.activityId), eq(radarAction.activityId, activityId))
		);
	}
	list(courseId: string, activityId: string): RadarAction[] {
		return this.database
			.select()
			.from(radarAction)
			.where(this.scope(courseId, activityId))
			.orderBy(radarAction.createdAt, radarAction.id)
			.all()
			.map((r) => ({ ...r.definition, id: r.id, revision: r.revision }));
	}
	get(id: string, courseId: string, activityId: string) {
		const row = this.database
			.select()
			.from(radarAction)
			.where(and(eq(radarAction.id, id), this.scope(courseId, activityId)))
			.get();
		if (!row) throw new RadarError(404, 'Acción no encontrada.');
		return row;
	}
	save(
		courseId: string,
		activityId: string,
		definition: RadarActionInput,
		id?: string,
		revision?: number
	): RadarAction {
		return this.database.transaction(() => {
			if (id) this.get(id, courseId, activityId);
			else if (
				this.database
					.select({ count: sql<number>`count(*)` })
					.from(radarAction)
					.where(eq(radarAction.courseId, courseId))
					.get()!.count >= 100
			)
				throw new RadarError(409, 'El curso ya tiene 100 acciones.');
			const values = { definition, activityId: definition.scope === 'course' ? null : activityId };
			if (id) {
				const updated = this.database
					.update(radarAction)
					.set({ ...values, revision: sql`${radarAction.revision} + 1` })
					.where(and(eq(radarAction.id, id), eq(radarAction.revision, revision!)))
					.returning()
					.get();
				if (!updated) throw new RadarError(409, 'La acción ha cambiado. Recarga antes de guardar.');
				return { ...updated.definition, id, revision: updated.revision };
			}
			const created = this.database
				.insert(radarAction)
				.values({ ...values, id: nanoid(), courseId, createdAt: this.radar.now() })
				.returning()
				.get();
			return { ...created.definition, id: created.id, revision: created.revision };
		});
	}
	delete(id: string, courseId: string, activityId: string, revision: number) {
		this.get(id, courseId, activityId);
		if (
			!this.database
				.delete(radarAction)
				.where(and(eq(radarAction.id, id), eq(radarAction.revision, revision)))
				.returning()
				.get()
		)
			throw new RadarError(409, 'La acción ha cambiado. Recarga antes de eliminar.');
	}
	enqueue(
		runId: string,
		actorId: string,
		actionId: string,
		revision: number,
		requestId: string
	): RadarActionExecution {
		const run = this.radar.get(runId);
		this.radar.ingest(run);
		return this.database.transaction(() => {
			const existing = this.database
				.select()
				.from(radarActionExecution)
				.where(
					and(
						eq(radarActionExecution.runId, runId),
						eq(radarActionExecution.actorId, actorId),
						eq(radarActionExecution.requestId, requestId)
					)
				)
				.get();
			if (existing) {
				if (existing.actionId !== actionId || existing.action.revision !== revision)
					throw new RadarError(409, 'El identificador de solicitud ya pertenece a otra ejecución.');
				return this.view(this.ensureValid(existing));
			}
			const action = this.get(actionId, run.courseId, run.activityId);
			if (action.revision !== revision)
				throw new RadarError(409, 'La acción ha cambiado. Recarga antes de ejecutar.');
			const active = this.database
				.select()
				.from(radarActionExecution)
				.where(
					and(
						eq(radarActionExecution.runId, runId),
						eq(radarActionExecution.actorId, actorId),
						sql`${radarActionExecution.state} IN ('queued', 'processing')`
					)
				)
				.all();
			if (active.some((e) => e.actionId === actionId))
				throw new RadarError(409, 'Esta acción ya se está ejecutando.');
			if (active.length >= 2)
				throw new RadarError(409, 'Espera a que termine alguna de tus dos acciones en curso.');
			const model = this.radar.models().find((m) => m.id === run.modelId);
			if (!model) throw new RadarError(409, 'El modelo del seguimiento ya no está disponible.');
			const snapshot = this.capture(runId, action.definition);
			const row = this.database
				.insert(radarActionExecution)
				.values({
					id: nanoid(),
					runId,
					actorId,
					actionId,
					requestId,
					action: { ...action.definition, revision },
					modelId: run.modelId,
					state: 'queued',
					snapshot,
					createdAt: this.radar.now()
				})
				.returning()
				.get();
			return this.view(row);
		});
	}
	private capture(runId: string, action: RadarActionInput): RadarActionSnapshot {
		const run = this.radar.get(runId),
			now = this.radar.now();
		const to = Math.min(+now, +run.endsAt - 1);
		const from =
			action.window === 'all'
				? +run.startsAt
				: Math.max(+run.startsAt, to - action.minutes * 60000 + 1);
		const previousFrom = action.window === 'compare' ? from - action.minutes * 60000 : null;
		if (to < from) throw new RadarError(409, 'El seguimiento todavía no ha comenzado.');
		if (previousFrom !== null && previousFrom < +run.startsAt)
			throw new RadarError(
				409,
				'Todavía no hay tiempo suficiente para comparar dos intervalos completos.'
			);
		const rows = this.radar
			.observations(runId)
			.filter((r) => +r.at >= (previousFrom ?? from) && +r.at <= to);
		const observationIds = new Set(rows.map((r) => r.id));
		const links = this.radar.links(runId).filter((l) => observationIds.has(l.observationId));
		const topicIds = new Set(links.map((l) => l.topicId));
		const topics = this.radar.topics(runId).filter((t) => topicIds.has(t.id));
		if (rows.length > 10000 || topics.length > 200 || to - from > 600 * 60000)
			throw new RadarError(
				422,
				'La instantánea es demasiado grande. Utiliza un intervalo reciente más corto.'
			);
		const membership = new Map<string, string[]>();
		for (const l of links)
			membership.set(l.observationId, [...(membership.get(l.observationId) ?? []), l.topicId]);
		const students = new Map<string, string>();
		for (const row of rows)
			if (!students.has(row.studentId)) students.set(row.studentId, `s${students.size + 1}`);
		const current = rows.filter((r) => +r.at >= from);
		return {
			at: now.toISOString(),
			from: new Date(from).toISOString(),
			to: new Date(to).toISOString(),
			previousFrom: previousFrom === null ? null : new Date(previousFrom).toISOString(),
			messages: current.length,
			students: new Set(current.map((r) => r.studentId)).size,
			processed: current.filter((r) => r.status === 'processed').length,
			pending: current.filter((r) => r.status === 'pending').length,
			notAnalyzable: current.filter((r) => r.status === 'not_analyzable').length,
			truncated: current.filter((r) => r.truncated).length,
			publishedVersion: run.publishedVersion,
			evidenceVersion: run.evidenceVersion,
			context: run.context,
			topics: topics.map((t) => ({ id: t.id, title: t.title, description: t.description })),
			observations: rows.map((r) => ({
				id: r.id,
				student: students.get(r.studentId)!,
				at: r.at.toISOString(),
				status: r.status,
				intent: r.intent,
				confusion: !!r.confusion,
				topicIds: membership.get(r.id) ?? []
			}))
		};
	}
	raw(id: string, runId: string) {
		const row = this.database
			.select()
			.from(radarActionExecution)
			.where(and(eq(radarActionExecution.id, id), eq(radarActionExecution.runId, runId)))
			.get();
		if (!row) throw new RadarError(404, 'Ejecución no encontrada.');
		return row;
	}
	ensureValid(row: ActionExecutionRow): ActionExecutionRow {
		if (!row.snapshot || row.state === 'invalidated') return row;
		const run = this.radar.get(row.runId);
		const ids = new Set(this.radar.observations(row.runId).map((r) => r.id));
		if (
			run.evidenceVersion !== row.snapshot.evidenceVersion ||
			row.snapshot.observations.some((r) => !ids.has(r.id))
		) {
			this.database
				.update(radarActionExecution)
				.set({
					state: 'invalidated',
					snapshot: null,
					result: null,
					error: 'Los datos de origen han cambiado o se han eliminado. Ejecuta de nuevo la acción.',
					finishedAt: this.radar.now(),
					leaseUntil: null
				})
				.where(eq(radarActionExecution.id, row.id))
				.run();
			return this.raw(row.id, row.runId);
		}
		return row;
	}
	view(row: ActionExecutionRow): RadarActionExecution {
		const s = row.snapshot;
		const usage = this.database
			.select({
				tokens: sql<number>`coalesce(sum(${aiUsageLog.totalTokens}), 0)`,
				estimatedCost: sql<
					number | null
				>`CASE WHEN count(${aiUsageLog.estimatedCost}) = count(*) THEN sum(${aiUsageLog.estimatedCost}) ELSE NULL END`
			})
			.from(aiUsageLog)
			.where(
				sql`json_valid(${aiUsageLog.metadata}) AND json_extract(${aiUsageLog.metadata}, '$.radarActionExecutionId') = ${row.id}`
			)
			.get()!;
		const model = this.database.select().from(aiModel).where(eq(aiModel.id, row.modelId)).get();
		if (model?.inputPricePerMillion == null || model.outputPricePerMillion == null)
			usage.estimatedCost = null;
		return {
			id: row.id,
			runId: row.runId,
			actionId: row.actionId,
			action: row.action,
			state: row.state,
			createdAt: row.createdAt.toISOString(),
			finishedAt: row.finishedAt?.toISOString() ?? null,
			error: row.error,
			result: row.result,
			usage,
			snapshot: s
				? {
						at: s.at,
						from: s.from,
						to: s.to,
						previousFrom: s.previousFrom,
						messages: s.messages,
						students: s.students,
						processed: s.processed,
						pending: s.pending,
						notAnalyzable: s.notAnalyzable,
						truncated: s.truncated,
						publishedVersion: s.publishedVersion
					}
				: null
		};
	}
	history(runId: string, offset: number) {
		const rows = this.database
			.select()
			.from(radarActionExecution)
			.where(eq(radarActionExecution.runId, runId))
			.orderBy(desc(radarActionExecution.createdAt), desc(radarActionExecution.id))
			.limit(21)
			.offset(offset)
			.all();
		return {
			executions: rows.slice(0, 20).map((r) => this.view(this.ensureValid(r))),
			nextOffset: rows.length > 20 ? offset + 20 : null
		};
	}
	evidence(row: ActionExecutionRow, ids: string[]) {
		row = this.ensureValid(row);
		if (!row.snapshot) throw new RadarError(409, 'La instantánea ya no está disponible.');
		const allowed = new Set(row.snapshot.observations.map((r) => r.id));
		if (ids.some((id) => !allowed.has(id)))
			throw new RadarError(404, 'Evidencia ajena a esta instantánea.');
		const selected = new Set(ids),
			run = this.radar.get(row.runId);
		return this.radar
			.observations(row.runId)
			.filter((r) => selected.has(r.id))
			.map((r) => ({ id: r.id, text: this.radar.input(run, r).text, at: r.at.toISOString() }));
	}
}
