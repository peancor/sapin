import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import {
	interactiveLearning,
	interactiveLearningLesson,
	interactiveLearningLessonRevision,
	interactiveLessonSession,
	lessonDefinitionBindingStatus,
	lessonRevisionStatus,
	lessonSessionScope,
	type InteractiveLearning,
	type InteractiveLearningLesson,
	type InteractiveLearningLessonRevision,
	type InteractiveLessonSession,
	type LessonDefinitionBindingStatusType,
	type LessonSessionScopeType
} from '$lib/server/db/schema';
import type { LessonDefinition } from '$lib/types/lesson';
import type {
	LessonRevisionAdminSummary,
	LessonRevisionDiffSummary,
	LessonRevisionImpactSummary,
	LessonRevisionSummary,
	LessonSessionRevisionInfo
} from '$lib/types/lessonRevision';
import { LessonServiceError } from './LessonServiceError';
import { parseLessonDefinition } from './lessonGraph';

type LessonRevisionState = {
	activity: InteractiveLearning;
	lesson: InteractiveLearningLesson;
	publishedRevision: InteractiveLearningLessonRevision;
	draftRevision: InteractiveLearningLessonRevision;
	publishedDefinition: LessonDefinition;
	draftDefinition: LessonDefinition;
};

function normalizeDefinitionJson(content: string): string {
	return JSON.stringify(parseLessonDefinition(content), null, 2);
}

function toRevisionSummary(revision: InteractiveLearningLessonRevision): LessonRevisionSummary {
	return {
		id: revision.id,
		revisionNumber: revision.revisionNumber,
		status: revision.status,
		publishedAt: revision.publishedAt ?? null,
		createdAt: revision.createdAt,
		updatedAt: revision.updatedAt
	};
}

function collectAssetFileIds(definition: LessonDefinition): string[] {
	return [...new Set(
		definition.blocks.flatMap((block) =>
			block.kind === 'content' ? (block.assetRefs ?? []).map((asset) => asset.fileId) : []
		)
	)];
}

export function buildLessonRevisionDiffSummary(input: {
	publishedDefinition: LessonDefinition;
	draftDefinition: LessonDefinition;
}): LessonRevisionDiffSummary {
	const publishedById = new Map(
		input.publishedDefinition.blocks.map((block) => [block.id, JSON.stringify(block)])
	);
	const draftById = new Map(input.draftDefinition.blocks.map((block) => [block.id, JSON.stringify(block)]));
	const addedBlockIds = [...draftById.keys()].filter((blockId) => !publishedById.has(blockId));
	const removedBlockIds = [...publishedById.keys()].filter((blockId) => !draftById.has(blockId));
	const changedBlockIds = [...draftById.keys()].filter(
		(blockId) => publishedById.has(blockId) && publishedById.get(blockId) !== draftById.get(blockId)
	);

	return {
		entryBlockChanged: input.publishedDefinition.entryBlockId !== input.draftDefinition.entryBlockId,
		addedBlockIds,
		removedBlockIds,
		changedBlockIds,
		totalChangedBlocks: addedBlockIds.length + removedBlockIds.length + changedBlockIds.length
	};
}

export class LessonRevisionService {
	static parseDefinition(content: string): LessonDefinition {
		return parseLessonDefinition(content);
	}

	static serializeDefinition(definition: LessonDefinition): string {
		return JSON.stringify(definition, null, 2);
	}

	static getScopeLabel(scope: LessonSessionScopeType): string {
		if (scope === lessonSessionScope.PREVIEW_DRAFT) return 'Preview borrador';
		if (scope === lessonSessionScope.PREVIEW_PUBLISHED) return 'Preview publicado';
		return 'Alumno';
	}

	static getSessionRevisionInfo(session: InteractiveLessonSession): LessonSessionRevisionInfo {
		return {
			revisionId: session.definitionRevisionId ?? null,
			revisionNumber: session.definitionRevisionNumber ?? null,
			bindingStatus: session.bindingStatus,
			scope: session.scope,
			scopeLabel: this.getScopeLabel(session.scope),
			isPreview: session.scope !== lessonSessionScope.LEARNER,
			isHistoricalApproximation:
				session.bindingStatus === lessonDefinitionBindingStatus.BACKFILLED_CURRENT
		};
	}

	static async resolvePublishedLessonRevision(
		interactiveLearningId: string
	): Promise<LessonRevisionState['publishedRevision']> {
		const state = await this.ensureLessonRevisionState(interactiveLearningId);
		return state.publishedRevision;
	}

	static async resolveDraftLessonRevision(
		interactiveLearningId: string
	): Promise<LessonRevisionState['draftRevision']> {
		const state = await this.ensureLessonRevisionState(interactiveLearningId);
		return state.draftRevision;
	}

	static async resolveLessonDefinitionForSession(input: {
		sessionId: string;
	}): Promise<{
		session: InteractiveLessonSession;
		revision: InteractiveLearningLessonRevision;
		definition: LessonDefinition;
	}> {
		const session = await db
			.select()
			.from(interactiveLessonSession)
			.where(eq(interactiveLessonSession.id, input.sessionId))
			.get();

		if (!session) {
			throw new LessonServiceError(404, 'Sesión de lesson no encontrada.');
		}

		const ensuredSession = await this.ensureSessionRevisionBinding(session);
		if (!ensuredSession.definitionRevisionId) {
			throw new LessonServiceError(500, 'La sesión no tiene revisión ligada.');
		}

		const revision = await db
			.select()
			.from(interactiveLearningLessonRevision)
			.where(eq(interactiveLearningLessonRevision.id, ensuredSession.definitionRevisionId))
			.get();

		if (!revision) {
			throw new LessonServiceError(404, 'No se encontró la revisión ligada a la sesión.');
		}

		return {
			session: ensuredSession,
			revision,
			definition: this.parseDefinition(revision.definitionJson)
		};
	}

	static async ensureLessonRevisionState(
		interactiveLearningId: string,
		options?: { actorUserId?: string | null }
	): Promise<LessonRevisionState> {
		const [activity, lesson] = await Promise.all([
			db.select().from(interactiveLearning).where(eq(interactiveLearning.id, interactiveLearningId)).get(),
			db
				.select()
				.from(interactiveLearningLesson)
				.where(eq(interactiveLearningLesson.id, interactiveLearningId))
				.get()
		]);

		if (!activity || activity.type !== 'lesson') {
			throw new LessonServiceError(404, 'Actividad lesson no encontrada.');
		}

		if (!lesson) {
			throw new LessonServiceError(
				500,
				'La actividad lesson no tiene configuración runtime asociada.'
			);
		}

		let publishedRevision =
			lesson.publishedRevisionId !== null
				? await db
						.select()
						.from(interactiveLearningLessonRevision)
						.where(eq(interactiveLearningLessonRevision.id, lesson.publishedRevisionId))
						.get()
				: null;
		let draftRevision =
			lesson.draftRevisionId !== null
				? await db
						.select()
						.from(interactiveLearningLessonRevision)
						.where(eq(interactiveLearningLessonRevision.id, lesson.draftRevisionId))
						.get()
				: null;

		const now = new Date();
		const normalizedCurrentContent = normalizeDefinitionJson(activity.content);
		let nextDraftRevisionId = lesson.draftRevisionId;
		let nextPublishedRevisionId = lesson.publishedRevisionId;

		if (!publishedRevision) {
			publishedRevision = await this.createRevision({
				interactiveLearningId,
				revisionNumber: 1,
				status: lessonRevisionStatus.PUBLISHED,
				definitionJson: normalizedCurrentContent,
				createdBy: options?.actorUserId ?? null,
				publishedAt: activity.publishedAt ?? now,
				createdAt: activity.createdAt,
				updatedAt: activity.updatedAt
			});
			nextPublishedRevisionId = publishedRevision.id;
		}

		if (!draftRevision) {
			draftRevision = await this.createRevision({
				interactiveLearningId,
				revisionNumber: Math.max(publishedRevision.revisionNumber + 1, 2),
				status: lessonRevisionStatus.DRAFT,
				definitionJson: publishedRevision.definitionJson,
				createdBy: options?.actorUserId ?? null,
				basedOnRevisionId: publishedRevision.id,
				createdAt: now,
				updatedAt: now
			});
			nextDraftRevisionId = draftRevision.id;
		}

		if (!publishedRevision || !draftRevision) {
			throw new LessonServiceError(500, 'No se pudo inicializar el versionado de la lesson.');
		}

		if (
			nextDraftRevisionId !== lesson.draftRevisionId ||
			nextPublishedRevisionId !== lesson.publishedRevisionId
		) {
			await db
				.update(interactiveLearningLesson)
				.set({
					draftRevisionId: nextDraftRevisionId,
					publishedRevisionId: nextPublishedRevisionId,
					updatedAt: now
				})
				.where(eq(interactiveLearningLesson.id, interactiveLearningId));
		}

		const refreshedLesson = await db
			.select()
			.from(interactiveLearningLesson)
			.where(eq(interactiveLearningLesson.id, interactiveLearningId))
			.get();

		if (!refreshedLesson) {
			throw new LessonServiceError(500, 'No se pudo recargar la configuración versionada.');
		}

		return {
			activity,
			lesson: refreshedLesson,
			publishedRevision,
			draftRevision,
			publishedDefinition: this.parseDefinition(publishedRevision.definitionJson),
			draftDefinition: this.parseDefinition(draftRevision.definitionJson)
		};
	}

	static async saveDraftDefinition(input: {
		interactiveLearningId: string;
		definition: LessonDefinition;
		actorUserId?: string | null;
	}): Promise<LessonRevisionState> {
		const state = await this.ensureLessonRevisionState(input.interactiveLearningId, {
			actorUserId: input.actorUserId
		});
		const now = new Date();
		const definitionJson = this.serializeDefinition(input.definition);

		await db
			.update(interactiveLearningLessonRevision)
			.set({
				definitionJson,
				basedOnRevisionId: state.publishedRevision.id,
				updatedAt: now
			})
			.where(eq(interactiveLearningLessonRevision.id, state.draftRevision.id));

		return this.ensureLessonRevisionState(input.interactiveLearningId, {
			actorUserId: input.actorUserId
		});
	}

	static async publishDraftRevision(input: {
		interactiveLearningId: string;
		actorUserId?: string | null;
	}): Promise<LessonRevisionState> {
		const state = await this.ensureLessonRevisionState(input.interactiveLearningId, {
			actorUserId: input.actorUserId
		});
		const normalizedDraftJson = normalizeDefinitionJson(state.draftRevision.definitionJson);
		const normalizedPublishedJson = normalizeDefinitionJson(state.publishedRevision.definitionJson);

		if (normalizedDraftJson === normalizedPublishedJson) {
			await db
				.update(interactiveLearning)
				.set({
					content: normalizedPublishedJson,
					updatedAt: new Date()
				})
				.where(eq(interactiveLearning.id, input.interactiveLearningId));
			return this.ensureLessonRevisionState(input.interactiveLearningId, {
				actorUserId: input.actorUserId
			});
		}

		const now = new Date();
		const highestRevision = await db
			.select()
			.from(interactiveLearningLessonRevision)
			.where(eq(interactiveLearningLessonRevision.interactiveLearningId, input.interactiveLearningId))
			.orderBy(desc(interactiveLearningLessonRevision.revisionNumber))
			.get();
		const nextPublishedNumber = (highestRevision?.revisionNumber ?? state.draftRevision.revisionNumber) + 1;
		const nextDraftNumber = nextPublishedNumber + 1;

		await db
			.update(interactiveLearningLessonRevision)
			.set({
				status: lessonRevisionStatus.ARCHIVED,
				updatedAt: now
			})
			.where(
				and(
					eq(
						interactiveLearningLessonRevision.interactiveLearningId,
						input.interactiveLearningId
					),
					inArray(interactiveLearningLessonRevision.id, [
						state.publishedRevision.id,
						state.draftRevision.id
					])
				)
			);

		const publishedRevision = await this.createRevision({
			interactiveLearningId: input.interactiveLearningId,
			revisionNumber: nextPublishedNumber,
			status: lessonRevisionStatus.PUBLISHED,
			definitionJson: normalizedDraftJson,
			createdBy: input.actorUserId ?? null,
			basedOnRevisionId: state.publishedRevision.id,
			publishedAt: now,
			createdAt: now,
			updatedAt: now
		});

		const draftRevision = await this.createRevision({
			interactiveLearningId: input.interactiveLearningId,
			revisionNumber: nextDraftNumber,
			status: lessonRevisionStatus.DRAFT,
			definitionJson: normalizedDraftJson,
			createdBy: input.actorUserId ?? null,
			basedOnRevisionId: publishedRevision.id,
			createdAt: now,
			updatedAt: now
		});

		await db
			.update(interactiveLearningLesson)
			.set({
				publishedRevisionId: publishedRevision.id,
				draftRevisionId: draftRevision.id,
				updatedAt: now
			})
			.where(eq(interactiveLearningLesson.id, input.interactiveLearningId));

		await db
			.update(interactiveLearning)
			.set({
				content: normalizedDraftJson,
				updatedAt: now
			})
			.where(eq(interactiveLearning.id, input.interactiveLearningId));

		return this.ensureLessonRevisionState(input.interactiveLearningId, {
			actorUserId: input.actorUserId
		});
	}

	static async discardDraftRevision(input: {
		interactiveLearningId: string;
		actorUserId?: string | null;
	}): Promise<LessonRevisionState> {
		const state = await this.ensureLessonRevisionState(input.interactiveLearningId, {
			actorUserId: input.actorUserId
		});

		await db
			.update(interactiveLearningLessonRevision)
			.set({
				definitionJson: state.publishedRevision.definitionJson,
				basedOnRevisionId: state.publishedRevision.id,
				updatedAt: new Date()
			})
			.where(eq(interactiveLearningLessonRevision.id, state.draftRevision.id));

		return this.ensureLessonRevisionState(input.interactiveLearningId, {
			actorUserId: input.actorUserId
		});
	}

	static async getRevisionAdminSummary(
		interactiveLearningId: string
	): Promise<LessonRevisionAdminSummary> {
		const state = await this.ensureLessonRevisionState(interactiveLearningId);
		const learnerSessions = await db
			.select()
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.interactiveLearningId, interactiveLearningId),
					eq(interactiveLessonSession.scope, lessonSessionScope.LEARNER)
				)
			)
			.all();

		const referencedRevisionIds = new Set(
			learnerSessions
				.map((session) => session.definitionRevisionId)
				.filter((revisionId): revisionId is string => Boolean(revisionId))
		);
		const allReferencedRevisions =
			referencedRevisionIds.size > 0
				? await db
						.select()
						.from(interactiveLearningLessonRevision)
						.where(inArray(interactiveLearningLessonRevision.id, [...referencedRevisionIds]))
						.all()
				: [];
		const allDefinitions = [
			state.publishedDefinition,
			state.draftDefinition,
			...allReferencedRevisions.map((revision) => this.parseDefinition(revision.definitionJson))
		];
		const impact: LessonRevisionImpactSummary = {
			activeAttemptsOnCurrentPublishedRevision: learnerSessions.filter(
				(session) =>
					session.status === 'active' &&
					session.definitionRevisionId === state.publishedRevision.id
			).length,
			activeAttemptsOnOlderRevisions: learnerSessions.filter(
				(session) =>
					session.status === 'active' &&
					session.definitionRevisionId !== null &&
					session.definitionRevisionId !== state.publishedRevision.id
			).length,
			completedAttemptsOnHistoricalRevisions: learnerSessions.filter(
				(session) =>
					session.status === 'completed' &&
					session.definitionRevisionId !== null &&
					session.definitionRevisionId !== state.publishedRevision.id
			).length,
			revisionsReferencedByLearnerAttempts: referencedRevisionIds.size,
			referencedAssetFileIds: [...new Set(allDefinitions.flatMap((definition) => collectAssetFileIds(definition)))]
		};

		return {
			published: toRevisionSummary(state.publishedRevision),
			draft: toRevisionSummary(state.draftRevision),
			diff: buildLessonRevisionDiffSummary({
				publishedDefinition: state.publishedDefinition,
				draftDefinition: state.draftDefinition
			}),
			impact
		};
	}

	static async ensureSessionRevisionBinding(
		session: InteractiveLessonSession
	): Promise<InteractiveLessonSession> {
		if (session.definitionRevisionId && session.definitionRevisionNumber !== null) {
			return session;
		}

		if (session.scope === lessonSessionScope.LEARNER) {
			throw new LessonServiceError(
				410,
				'Este intento pertenece al runtime anterior de lessons y ya no está disponible.'
			);
		}

		const state = await this.ensureLessonRevisionState(session.interactiveLearningId);
		const targetRevision =
			session.scope === lessonSessionScope.PREVIEW_DRAFT
				? state.draftRevision
				: state.publishedRevision;
		const nextBindingStatus: LessonDefinitionBindingStatusType =
			lessonDefinitionBindingStatus.EXACT;

		await db
			.update(interactiveLessonSession)
			.set({
				definitionRevisionId: targetRevision.id,
				definitionRevisionNumber: targetRevision.revisionNumber,
				bindingStatus: nextBindingStatus
			})
			.where(eq(interactiveLessonSession.id, session.id));

		const refreshed = await db
			.select()
			.from(interactiveLessonSession)
			.where(eq(interactiveLessonSession.id, session.id))
			.get();

		if (!refreshed) {
			throw new LessonServiceError(500, 'No se pudo refrescar el binding de revisión.');
		}

		return refreshed;
	}

	private static async createRevision(input: {
		interactiveLearningId: string;
		revisionNumber: number;
		status: InteractiveLearningLessonRevision['status'];
		definitionJson: string;
		createdBy?: string | null;
		basedOnRevisionId?: string | null;
		publishedAt?: Date | null;
		createdAt: Date;
		updatedAt: Date;
	}): Promise<InteractiveLearningLessonRevision> {
		const revisionId = nanoid();

		await db.insert(interactiveLearningLessonRevision).values({
			id: revisionId,
			interactiveLearningId: input.interactiveLearningId,
			revisionNumber: input.revisionNumber,
			status: input.status,
			definitionJson: normalizeDefinitionJson(input.definitionJson),
			createdBy: input.createdBy ?? null,
			basedOnRevisionId: input.basedOnRevisionId ?? null,
			publishedAt: input.publishedAt ?? null,
			createdAt: input.createdAt,
			updatedAt: input.updatedAt
		});

		const created = await db
			.select()
			.from(interactiveLearningLessonRevision)
			.where(eq(interactiveLearningLessonRevision.id, revisionId))
			.get();

		if (!created) {
			throw new LessonServiceError(500, 'No se pudo crear la revisión de lesson.');
		}

		return created;
	}
}
