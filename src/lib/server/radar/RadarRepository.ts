import { and, desc, eq, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { db } from '$lib/server/db';
import {
	aiModel,
	aiProvider,
	aiUsageLog,
	agentMessage,
	chat,
	courseInteractiveLearning,
	interactiveLearning,
	message,
	radarAnalysis,
	radarObservation,
	radarObservationTopic,
	radarRun,
	radarTopic,
	user,
	userInteractiveLearningChat
} from '$lib/server/db/schema';
import type { LearningEvidenceTranscriptMessage } from '$lib/types/learningEvidence';
import type {
	RadarEvidencePage,
	RadarHistory,
	RadarRunView,
	RadarSnapshot,
	RadarWindow
} from '$lib/types/radar';
import {
	aggregateTopics,
	isInternal,
	normalizeTitle,
	RECENT_MS,
	statistics,
	type Extraction,
	type RadarInput,
	type Synthesis
} from './domain';

export type RadarDatabase = typeof db;
export type Run = typeof radarRun.$inferSelect;
export type Observation = typeof radarObservation.$inferSelect;
export type RadarTransaction = Parameters<Parameters<RadarDatabase['transaction']>[0]>[0];
export class RadarError extends Error {
	public status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export function runView(run: Run): RadarRunView {
	return {
		id: run.id,
		title: run.title,
		courseId: run.courseId,
		activityId: run.activityId,
		activityType: run.activityType,
		state: run.state,
		analysisState: run.analysisState,
		modelId: run.modelId,
		modelName: run.modelName,
		context: run.context,
		error: run.error,
		summary: run.summary,
		publishedVersion: run.publishedVersion,
		startsAt: run.startsAt.toISOString(),
		endsAt: run.endsAt.toISOString(),
		analyzedAt: run.analyzedAt?.toISOString() ?? null
	};
}

/** Called before deleting a chat graph; no transcript copies survive in radar tables. */
export function invalidateRadarChats(tx: RadarTransaction, chatIds: string[]) {
	if (!chatIds.length) return;
	const ids = tx
		.selectDistinct({ id: radarObservation.runId })
		.from(radarObservation)
		.where(inArray(radarObservation.chatId, chatIds))
		.all()
		.map((r) => r.id);
	if (!ids.length) return;
	tx.delete(radarObservation).where(inArray(radarObservation.chatId, chatIds)).run();
	invalidateRuns(tx, ids);
}
function invalidateRuns(tx: RadarTransaction, ids: string[]) {
	tx.update(radarRun)
		.set({
			summary: null,
			analyzedAt: null,
			synthesisPending: true,
			analysisState: 'pending',
			nextAnalysisAt: new Date(0),
			evidenceVersion: sql`${radarRun.evidenceVersion} + 1`,
			publishedVersion: sql`${radarRun.publishedVersion} + 1`,
			publishedObservationCount: 0
		})
		.where(inArray(radarRun.id, ids))
		.run();
	tx.update(radarAnalysis).set({ summary: null }).where(inArray(radarAnalysis.runId, ids)).run();
	// Rebuild all interpretations after deletion: other messages may have used deleted context.
	tx.update(radarObservation)
		.set({ status: 'pending', intent: null, confusion: null, evidenceIds: null })
		.where(and(inArray(radarObservation.runId, ids), eq(radarObservation.status, 'processed')))
		.run();
	tx.delete(radarObservationTopic).where(inArray(radarObservationTopic.runId, ids)).run();
	tx.delete(radarTopic).where(inArray(radarTopic.runId, ids)).run();
}

export class RadarRepository {
	public database: RadarDatabase;
	public now: () => Date;
	constructor(database: RadarDatabase, now: () => Date = () => new Date()) {
		this.database = database;
		this.now = now;
	}
	activity(courseId: string, activityId: string) {
		const row = this.database
			.select({ id: courseInteractiveLearning.id, type: interactiveLearning.type })
			.from(courseInteractiveLearning)
			.innerJoin(
				interactiveLearning,
				eq(interactiveLearning.id, courseInteractiveLearning.interactiveLearningId)
			)
			.where(
				and(
					eq(courseInteractiveLearning.courseId, courseId),
					eq(interactiveLearning.id, activityId)
				)
			)
			.get();
		if (!row || (row.type !== 'chat' && row.type !== 'agent'))
			throw new RadarError(404, 'Actividad de chat no encontrada en este curso.');
		return { ...row, type: row.type as 'chat' | 'agent' };
	}
	models() {
		return this.database
			.select({ model: aiModel })
			.from(aiModel)
			.innerJoin(aiProvider, eq(aiProvider.id, aiModel.providerId))
			.where(and(eq(aiModel.isActive, true), eq(aiProvider.isActive, true)))
			.orderBy(aiModel.sortOrder)
			.all()
			.map((r) => r.model)
			.filter((m) => {
				try {
					return !m.capabilities || JSON.parse(m.capabilities).includes('text');
				} catch {
					return false;
				}
			});
	}
	get(id: string, courseId?: string, activityId?: string): Run {
		const run = this.database.select().from(radarRun).where(eq(radarRun.id, id)).get();
		if (
			!run ||
			(courseId && run.courseId !== courseId) ||
			(activityId && run.activityId !== activityId)
		)
			throw new RadarError(404, 'Seguimiento no encontrado.');
		return run;
	}
	history(courseId: string, activityId: string, offset = 0): RadarHistory {
		this.closeExpired();
		const scope = and(eq(radarRun.courseId, courseId), eq(radarRun.activityId, activityId));
		const active = this.database
			.select()
			.from(radarRun)
			.where(and(scope, eq(radarRun.state, 'active')))
			.get();
		const runs = this.database
			.select()
			.from(radarRun)
			.where(and(scope, sql`${radarRun.state} != 'active'`))
			.orderBy(desc(radarRun.startsAt), radarRun.id)
			.limit(21)
			.offset(offset)
			.all();
		return {
			active: active ? runView(active) : null,
			runs: runs.slice(0, 20).map(runView),
			nextOffset: runs.length > 20 ? offset + 20 : null
		};
	}
	create(
		courseId: string,
		activityId: string,
		creatorId: string,
		input: { title: string; durationMinutes: number; modelId: string; context?: string }
	): Run {
		const activity = this.activity(courseId, activityId);
		this.closeExpired();
		const model = this.models().find((m) => m.id === input.modelId);
		if (!model) throw new RadarError(400, 'Selecciona un modelo de texto habilitado.');
		// Source timestamps have second precision; use the same resolution for interval boundaries.
		const start = new Date(Math.floor(+this.now() / 1000) * 1000);
		return this.database.transaction(
			(tx) => {
				const existing = tx
					.select()
					.from(radarRun)
					.where(
						and(
							eq(radarRun.courseId, courseId),
							eq(radarRun.activityId, activityId),
							eq(radarRun.state, 'active')
						)
					)
					.get();
				if (existing) return existing;
				return tx
					.insert(radarRun)
					.values({
						id: nanoid(),
						courseId,
						activityId,
						courseActivityId: activity.id,
						creatorId,
						title: input.title,
						activityType: activity.type,
						modelId: model.id,
						modelName: model.displayName,
						context: input.context || null,
						startsAt: start,
						endsAt: new Date(+start + input.durationMinutes * 60000),
						nextAnalysisAt: start
					})
					.returning()
					.get();
			},
			{ behavior: 'immediate' }
		);
	}
	patch(id: string, input: { title?: string; endsAt?: string }): Run {
		this.closeExpired();
		const run = this.get(id);
		if (run.state !== 'active') throw new RadarError(409, 'El seguimiento ya está cerrado.');
		const end = input.endsAt ? new Date(input.endsAt) : run.endsAt;
		if (+end < +run.endsAt || +end > +run.startsAt + 240 * 60000 || +end <= +this.now())
			throw new RadarError(400, 'Solo puedes ampliar el fin, hasta cuatro horas desde el inicio.');
		const updated = this.database
			.update(radarRun)
			.set({
				...(input.title ? { title: input.title } : {}),
				...(input.endsAt ? { endsAt: end } : {})
			})
			.where(
				and(eq(radarRun.id, id), eq(radarRun.state, 'active'), eq(radarRun.endsAt, run.endsAt))
			)
			.returning()
			.get();
		if (!updated)
			throw new RadarError(409, 'El seguimiento ha cambiado. Actualiza antes de editarlo.');
		return updated;
	}
	stop(id: string): Run {
		const run = this.get(id);
		if (run.state === 'active')
			this.database
				.update(radarRun)
				.set({
					state: 'finalizing',
					endsAt: new Date(Math.min(+run.endsAt, Math.floor(+this.now() / 1000) * 1000)),
					nextAnalysisAt: this.now()
				})
				.where(and(eq(radarRun.id, id), eq(radarRun.state, 'active')))
				.run();
		return this.get(id);
	}
	queue(id: string): Run {
		this.database
			.update(radarRun)
			.set({ nextAnalysisAt: this.now(), error: null, analysisState: 'pending' })
			.where(
				and(
					eq(radarRun.id, id),
					or(sql`${radarRun.leaseUntil} IS NULL`, lt(radarRun.leaseUntil, this.now()))
				)
			)
			.run();
		return this.get(id);
	}
	closeExpired() {
		this.database
			.update(radarRun)
			.set({ state: 'finalizing', nextAnalysisAt: this.now() })
			.where(and(eq(radarRun.state, 'active'), sql`${radarRun.endsAt} <= ${+this.now()}`))
			.run();
	}
	observations(id: string) {
		return this.database
			.select()
			.from(radarObservation)
			.where(eq(radarObservation.runId, id))
			.orderBy(radarObservation.at, radarObservation.id)
			.all();
	}
	topics(id: string) {
		return this.database
			.select()
			.from(radarTopic)
			.where(eq(radarTopic.runId, id))
			.orderBy(radarTopic.id)
			.all();
	}
	links(id: string) {
		return this.database
			.select()
			.from(radarObservationTopic)
			.where(eq(radarObservationTopic.runId, id))
			.all();
	}

	/** Query by message time, not conversation creation. NOT EXISTS avoids a lossy timestamp cursor. */
	ingest(run: Run) {
		this.activity(run.courseId, run.activityId);
		const source = run.activityType === 'chat' ? message : agentMessage;
		const content = run.activityType === 'chat' ? message.content : agentMessage.textContent;
		const role = run.activityType === 'chat' ? message.type : agentMessage.role;
		const origin =
			run.activityType === 'chat' ? radarObservation.messageId : radarObservation.agentMessageId;
		const rows = this.database
			.selectDistinct({
				id: source.id,
				chatId: source.chatId,
				studentId: chat.userId,
				at: source.createdAt,
				text: content
			})
			.from(source)
			.innerJoin(chat, eq(chat.id, source.chatId))
			.innerJoin(
				userInteractiveLearningChat,
				and(
					eq(userInteractiveLearningChat.chatId, chat.id),
					eq(userInteractiveLearningChat.userId, chat.userId)
				)
			)
			.where(
				and(
					eq(userInteractiveLearningChat.interactiveLearningChatId, run.activityId),
					gte(source.createdAt, run.startsAt),
					// Keep a fractional planned end exact even though source timestamps use seconds.
					sql`${source.createdAt} < ${+run.endsAt / 1000}`,
					lte(source.createdAt, this.now()),
					sql`lower(${role}) = 'user'`,
					sql`exists (select 1 from course_role cr where cr.course_id = ${run.courseId} and cr.user_id = ${chat.userId} and cr.is_active = 1 and cr.role = 'student')`,
					sql`not exists (select 1 from course_role cr where cr.course_id = ${run.courseId} and cr.user_id = ${chat.userId} and cr.is_active = 1 and cr.role != 'student')`,
					sql`not exists (select 1 from ${radarObservation} where ${radarObservation.runId} = ${run.id} and ${origin} = ${source.id})`
				)
			)
			.all()
			.filter((row) => !isInternal(row.text));
		if (rows.length)
			this.database.transaction((tx) => {
				for (const row of rows)
					tx.insert(radarObservation)
						.values({
							id: nanoid(),
							runId: run.id,
							chatId: row.chatId,
							studentId: row.studentId,
							at: row.at,
							messageId: run.activityType === 'chat' ? row.id : null,
							agentMessageId: run.activityType === 'agent' ? row.id : null,
							status: row.text?.trim() ? 'pending' : 'not_analyzable'
						})
						.onConflictDoNothing()
						.run();
				tx.update(radarRun)
					.set({ analysisState: 'pending' })
					.where(and(eq(radarRun.id, run.id), eq(radarRun.analysisState, 'current')))
					.run();
			});
		// Handles deletion paths outside ActivityAttemptDeletionService as well.
		const count = this.database
			.select({ n: sql<number>`count(*)` })
			.from(radarObservation)
			.where(and(eq(radarObservation.runId, run.id), eq(radarObservation.status, 'processed')))
			.get()!.n;
		if (count < run.publishedObservationCount)
			this.database.transaction((tx) => invalidateRuns(tx, [run.id]));
	}

	transcript(run: Run, observation: Observation): LearningEvidenceTranscriptMessage[] {
		const source = run.activityType === 'chat' ? message : agentMessage;
		const content = run.activityType === 'chat' ? message.content : agentMessage.textContent;
		const role = run.activityType === 'chat' ? message.type : agentMessage.role;
		const sourceId = observation.messageId ?? observation.agentMessageId!;
		// rowid preserves insertion order for equal-second timestamps; IDs are random, not chronological.
		const rows = this.database
			.select({ id: source.id, text: content, role, at: source.createdAt })
			.from(source)
			.where(
				and(
					eq(source.chatId, observation.chatId),
					sql`lower(${role}) in ('user', 'assistant')`,
					or(
						lt(source.createdAt, observation.at),
						and(
							eq(source.createdAt, observation.at),
							sql`${source}.rowid <= (select rowid from ${source} where id = ${sourceId})`
						)
					)
				)
			)
			.orderBy(desc(source.createdAt), sql`${source}.rowid desc`)
			.limit(40)
			.all()
			.filter((r) => r.text?.trim() && !isInternal(r.text))
			.slice(0, 7)
			.reverse();
		return rows.map((r) => ({
			id: r.id,
			role: r.role.toLowerCase() as 'user' | 'assistant',
			createdAt: r.at.toISOString(),
			displayText: r.text ?? '',
			parts: [{ kind: 'text' as const, text: r.text ?? '' }],
			source: run.activityType === 'chat' ? 'chat_message' : 'agent_message'
		}));
	}
	input(run: Run, observation: Observation): RadarInput {
		const transcript = this.transcript(run, observation);
		const original = observation.messageId ?? observation.agentMessageId;
		const target = transcript.find((r) => r.id === original);
		return {
			id: observation.id,
			student: `s-${observation.studentId}`,
			text: target?.displayText ?? '',
			truncated: false,
			context: transcript
				.filter((r) => r.id !== original)
				.slice(-6)
				.map((r, index) => ({
					id: `${observation.id}:c${index}`,
					role: r.role as 'user' | 'assistant',
					text: r.displayText
				}))
		};
	}
	snapshot(id: string, window: RadarWindow): RadarSnapshot {
		this.closeExpired();
		this.ingest(this.get(id));
		const run = this.get(id),
			rows = this.observations(id),
			endpoint = new Date(Math.min(+run.endsAt, +this.now()));
		const usage = this.database
			.select({
				tokens: sql<number>`coalesce(sum(${aiUsageLog.totalTokens}),0)`,
				cost: sql<number>`coalesce(sum(${aiUsageLog.estimatedCost}),0)`
			})
			.from(aiUsageLog)
			.where(
				and(
					eq(aiUsageLog.interactiveLearningId, run.activityId),
					sql`json_valid(${aiUsageLog.metadata}) and json_extract(${aiUsageLog.metadata}, '$.radarRunId') = ${id}`
				)
			)
			.get()!;
		const model = this.database.select().from(aiModel).where(eq(aiModel.id, run.modelId)).get();
		return {
			run: runView(run),
			window,
			serverTime: this.now().toISOString(),
			statistics: statistics(rows, run.startsAt, endpoint),
			topics: aggregateTopics(
				this.topics(id),
				this.links(id),
				rows,
				window,
				run.startsAt,
				endpoint
			),
			usage: {
				tokens: usage.tokens,
				estimatedCost:
					model?.inputPricePerMillion != null && model.outputPricePerMillion != null
						? usage.cost
						: null
			}
		};
	}
	evidence(id: string, topicId: string, window: RadarWindow, offset: number): RadarEvidencePage {
		this.ingest(this.get(id));
		const run = this.get(id);
		if (!this.topics(id).some((t) => t.id === topicId))
			throw new RadarError(404, 'Agrupación no encontrada.');
		const cutoff = new Date(Math.min(+run.endsAt, +this.now()) - RECENT_MS);
		const rows = this.database
			.select({ observation: radarObservation, student: user })
			.from(radarObservation)
			.innerJoin(
				radarObservationTopic,
				eq(radarObservationTopic.observationId, radarObservation.id)
			)
			.innerJoin(user, eq(user.id, radarObservation.studentId))
			.where(
				and(
					eq(radarObservation.runId, id),
					eq(radarObservationTopic.topicId, topicId),
					window === 'recent' ? gte(radarObservation.at, cutoff) : undefined
				)
			)
			.orderBy(desc(radarObservation.at), radarObservation.id)
			.limit(21)
			.offset(offset)
			.all();
		return {
			evidence: rows.slice(0, 20).map(({ observation: o, student }) => {
				const transcript = this.transcript(run, o),
					sourceId = o.messageId ?? o.agentMessageId;
				return {
					id: o.id,
					studentId: o.studentId,
					studentName: student.displayName || student.alias || student.username || 'Estudiante',
					at: o.at.toISOString(),
					text: transcript.find((m) => m.id === sourceId)?.displayText ?? '',
					chatUrl: `/${run.activityType === 'chat' ? 'interactive-chat' : 'agent-chat'}/${run.activityId}/view/${o.chatId}`,
					intent: o.intent,
					confusion: o.confusion,
					insufficientContext: o.insufficientContext,
					truncated: o.truncated,
					context: transcript
						.filter((m) => m.id !== sourceId)
						.map((m) => ({
							id: m.id,
							role: m.role as 'user' | 'assistant',
							text: m.displayText,
							at: m.createdAt
						}))
				};
			}),
			nextOffset: rows.length > 20 ? offset + 20 : null
		};
	}
	claim(id: string, owner: string): Run | undefined {
		return this.database
			.update(radarRun)
			.set({
				leaseOwner: owner,
				leaseUntil: new Date(+this.now() + 180000),
				analysisState: 'processing',
				error: null
			})
			.where(
				and(
					eq(radarRun.id, id),
					sql`${radarRun.nextAnalysisAt} <= ${+this.now()}`,
					sql`${radarRun.analysisState} != 'blocked'`,
					or(sql`${radarRun.leaseUntil} IS NULL`, sql`${radarRun.leaseUntil} < ${+this.now()}`)
				)
			)
			.returning()
			.get();
	}
	renew(id: string, owner: string) {
		const result = this.database
			.update(radarRun)
			.set({ leaseUntil: new Date(+this.now() + 180000) })
			.where(
				and(
					eq(radarRun.id, id),
					eq(radarRun.leaseOwner, owner),
					sql`${radarRun.leaseUntil} > ${+this.now()}`
				)
			)
			.run();
		if (!result.changes) throw new Error('El bloqueo del seguimiento ha caducado.');
	}
	fenced(tx: RadarTransaction, run: Run, owner: string) {
		const current = tx.select().from(radarRun).where(eq(radarRun.id, run.id)).get();
		if (
			!current ||
			current.leaseOwner !== owner ||
			!current.leaseUntil ||
			+current.leaseUntil <= +this.now() ||
			current.evidenceVersion !== run.evidenceVersion
		)
			throw new Error('El seguimiento cambió durante el análisis.');
		return current;
	}
	publish(run: Run, owner: string, result: Extraction, input: RadarInput[]) {
		this.database.transaction((tx) => {
			this.fenced(tx, run, owner);
			const observations = tx
				.select()
				.from(radarObservation)
				.where(
					and(
						eq(radarObservation.runId, run.id),
						inArray(
							radarObservation.id,
							input.map((i) => i.id)
						)
					)
				)
				.all();
			if (observations.length !== input.length || observations.some((o) => o.status !== 'pending'))
				throw new Error('Las evidencias del lote han cambiado.');
			for (const row of result.observations) {
				const observation = observations.find((o) => o.id === row.id)!;
				const originalId = observation.messageId ?? observation.agentMessageId!;
				const context = this.transcript(run, observation)
					.filter((m) => m.id !== originalId)
					.slice(-6);
				const references = new Map<string, string>([
					[row.id, originalId],
					...context.map((m, index) => [`${row.id}:c${index}`, m.id] as const)
				]);
				tx.update(radarObservation)
					.set({
						status: 'processed',
						intent: row.intent,
						confusion: row.confusion,
						evidenceIds: row.evidenceIds.map((id) => references.get(id)!).filter(Boolean),
						insufficientContext: row.insufficientContext,
						truncated: input.find((i) => i.id === row.id)!.truncated
					})
					.where(eq(radarObservation.id, row.id))
					.run();
				for (const candidate of row.topics) {
					const normalized = normalizeTitle(candidate.title);
					let topic = candidate.existingId
						? tx
								.select()
								.from(radarTopic)
								.where(and(eq(radarTopic.id, candidate.existingId), eq(radarTopic.runId, run.id)))
								.get()
						: tx
								.select()
								.from(radarTopic)
								.where(
									and(eq(radarTopic.runId, run.id), eq(radarTopic.normalizedTitle, normalized))
								)
								.get();
					if (!topic && candidate.existingId) throw new Error('Tema ajeno al seguimiento.');
					if (!topic)
						topic = tx
							.insert(radarTopic)
							.values({
								id: nanoid(),
								runId: run.id,
								title: candidate.title.trim(),
								normalizedTitle: normalized,
								description: candidate.description,
								createdAt: this.now()
							})
							.returning()
							.get();
					tx.insert(radarObservationTopic)
						.values({ runId: run.id, observationId: row.id, topicId: topic.id })
						.onConflictDoNothing()
						.run();
				}
			}
			const count = tx
				.select({ n: sql<number>`count(*)` })
				.from(radarObservation)
				.where(and(eq(radarObservation.runId, run.id), eq(radarObservation.status, 'processed')))
				.get()!.n;
			tx.update(radarRun)
				.set({
					synthesisPending: true,
					analyzedAt: this.now(),
					publishedObservationCount: count,
					publishedVersion: sql`${radarRun.publishedVersion} + 1`
				})
				.where(eq(radarRun.id, run.id))
				.run();
		});
	}
	publishSynthesis(run: Run, owner: string, result: Synthesis, allowed: Map<string, Set<string>>) {
		for (const c of result.clarifications)
			if (!allowed.has(c.topicId) || c.evidenceIds.some((id) => !allowed.get(c.topicId)!.has(id)))
				throw new Error('Respuesta incompatible: aclaración sin evidencias válidas.');
		this.database.transaction((tx) => {
			this.fenced(tx, run, owner);
			tx.update(radarTopic)
				.set({ suggestion: null, suggestionEvidence: null })
				.where(eq(radarTopic.runId, run.id))
				.run();
			for (const c of result.clarifications)
				tx.update(radarTopic)
					.set({ suggestion: c.suggestion, suggestionEvidence: c.evidenceIds })
					.where(and(eq(radarTopic.runId, run.id), eq(radarTopic.id, c.topicId)))
					.run();
			tx.update(radarRun)
				.set({
					summary: result.summary,
					synthesisPending: false,
					analyzedAt: this.now(),
					publishedVersion: sql`${radarRun.publishedVersion} + 1`
				})
				.where(eq(radarRun.id, run.id))
				.run();
		});
	}
}
