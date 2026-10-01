import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { auditAction, auditSeverity } from '$lib/server/db/schema';
import { auditService } from '$lib/server/logging/AuditService';

export type AttemptDeletionKind = 'lesson' | 'chat' | 'agent';

export interface AttemptDeletionInput {
	courseId: string;
	activityId: string;
	deletedByUserId: string;
	deletedBySystemRoleLevel: number;
	reason?: string | null;
}

export interface LessonAttemptDeletionInput extends AttemptDeletionInput {
	sessionId: string;
}

export interface ChatAttemptDeletionInput extends AttemptDeletionInput {
	chatId: string;
}

export interface AttemptDeletionResult {
	kind: AttemptDeletionKind;
	courseId: string;
	activityId: string;
	userId: string;
	chatIds: string[];
	deletedCounts: Record<string, number>;
	progress: {
		remainingAttempts: number;
		status: string | null;
	};
}

export type AttemptProgressEvidence = {
	startedAt: Date;
	lastInteractionAt: Date;
	completedAt: Date | null;
	timeSpentSeconds: number;
	completed: boolean;
};

export type RecomputedAttemptProgress = {
	startedAt: Date;
	lastInteractionAt: Date;
	completedAt: Date | null;
	status: (typeof schema.learningActivityStatus)[keyof typeof schema.learningActivityStatus];
	timeSpentSeconds: number;
	attemptsCount: number;
};

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function requireDeleteConfirmation(formData: FormData): void {
	if (String(formData.get('confirm') ?? '').trim() !== 'BORRAR') {
		throw error(400, 'Debes escribir BORRAR para confirmar el borrado del intento.');
	}
}

function normalizeReason(value: FormDataEntryValue | null): string | null {
	const reason = String(value ?? '').trim();
	return reason.length > 0 ? reason.slice(0, 500) : null;
}

async function requireAdminAccess(input: AttemptDeletionInput): Promise<void> {
	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		input.deletedByUserId,
		input.courseId,
		input.activityId,
		input.deletedBySystemRoleLevel
	);

	if (!access.allowed) {
		throw error(403, access.reason || 'No tienes permisos para borrar intentos de esta actividad.');
	}
}

function estimateDuration(
	startedAt: Date,
	lastInteractionAt: Date,
	completedAt: Date | null
): number {
	const endAt = completedAt ?? lastInteractionAt;
	return Math.max(0, Math.floor((endAt.getTime() - startedAt.getTime()) / 1000));
}

export function buildRecomputedAttemptProgress(
	evidence: AttemptProgressEvidence[]
): RecomputedAttemptProgress | null {
	if (evidence.length === 0) return null;

	const startedAt = evidence.reduce((earliest, item) =>
		item.startedAt < earliest.startedAt ? item : earliest
	).startedAt;
	const lastInteractionAt = evidence.reduce((latest, item) =>
		item.lastInteractionAt > latest.lastInteractionAt ? item : latest
	).lastInteractionAt;
	const completedEvidence = evidence.filter((item) => item.completed);
	const completedAt =
		completedEvidence.length > 0
			? completedEvidence.reduce((latest, item) =>
					(item.completedAt ?? item.lastInteractionAt) >
					(latest.completedAt ?? latest.lastInteractionAt)
						? item
						: latest
				).completedAt
			: null;
	const status =
		completedEvidence.length > 0
			? schema.learningActivityStatus.COMPLETED
			: schema.learningActivityStatus.IN_PROGRESS;
	const timeSpentSeconds = evidence.reduce((total, item) => total + item.timeSpentSeconds, 0);

	return {
		startedAt,
		lastInteractionAt,
		completedAt,
		status,
		timeSpentSeconds,
		attemptsCount: evidence.length
	};
}

async function syncCourseProgressSummary(userId: string, courseId: string): Promise<void> {
	const [activityRows, courseActivities, existingSummary] = await Promise.all([
		db
			.select()
			.from(schema.learningActivityProgress)
			.where(
				and(
					eq(schema.learningActivityProgress.userId, userId),
					eq(schema.learningActivityProgress.courseId, courseId)
				)
			)
			.all(),
		db
			.select({ activityId: schema.courseInteractiveLearning.interactiveLearningId })
			.from(schema.courseInteractiveLearning)
			.where(eq(schema.courseInteractiveLearning.courseId, courseId))
			.all(),
		db
			.select()
			.from(schema.courseProgressSummary)
			.where(
				and(
					eq(schema.courseProgressSummary.userId, userId),
					eq(schema.courseProgressSummary.courseId, courseId)
				)
			)
			.get()
	]);

	const totalActivities = courseActivities.length;
	const completedActivities = activityRows.filter((row) => row.status === 'completed').length;
	const inProgressActivities = activityRows.filter((row) => row.status === 'in_progress').length;
	const totalTimeSpentSeconds = activityRows.reduce(
		(total, row) => total + row.timeSpentSeconds,
		0
	);
	const lastActivityAt = activityRows.reduce<Date | null>((latest, row) => {
		if (!latest || row.lastInteractionAt > latest) return row.lastInteractionAt;
		return latest;
	}, null);
	const completionRate =
		totalActivities > 0
			? Math.min(100, Math.round((completedActivities / totalActivities) * 100))
			: 0;
	const now = new Date();

	if (!existingSummary) {
		if (activityRows.length === 0) return;

		await db.insert(schema.courseProgressSummary).values({
			id: crypto.randomUUID(),
			userId,
			courseId,
			completedActivities,
			inProgressActivities,
			completionRate,
			totalTimeSpentSeconds,
			lastActivityAt,
			metadataJson: JSON.stringify({
				source: 'attempt-delete',
				updatedAt: now.toISOString(),
				totalActivities
			}),
			createdAt: now,
			updatedAt: now
		});
		return;
	}

	await db
		.update(schema.courseProgressSummary)
		.set({
			completedActivities,
			inProgressActivities,
			completionRate,
			totalTimeSpentSeconds,
			lastActivityAt,
			metadataJson: JSON.stringify({
				source: 'attempt-delete',
				updatedAt: now.toISOString(),
				totalActivities
			}),
			updatedAt: now
		})
		.where(eq(schema.courseProgressSummary.id, existingSummary.id));
}

async function recomputeActivityProgress(input: {
	userId: string;
	courseId: string;
	activityId: string;
	activityType: AttemptDeletionKind;
}): Promise<AttemptDeletionResult['progress']> {
	const evidence =
		input.activityType === 'lesson'
			? await loadLessonProgressEvidence(input)
			: await loadChatProgressEvidence(input);

	await db
		.delete(schema.learningProgressEvent)
		.where(
			and(
				eq(schema.learningProgressEvent.userId, input.userId),
				eq(schema.learningProgressEvent.courseId, input.courseId),
				eq(schema.learningProgressEvent.activityId, input.activityId)
			)
		);

	const existingProgress = await db
		.select()
		.from(schema.learningActivityProgress)
		.where(
			and(
				eq(schema.learningActivityProgress.userId, input.userId),
				eq(schema.learningActivityProgress.courseId, input.courseId),
				eq(schema.learningActivityProgress.activityId, input.activityId)
			)
		)
		.get();

	if (evidence.length === 0) {
		if (existingProgress) {
			await db
				.delete(schema.learningActivityProgress)
				.where(eq(schema.learningActivityProgress.id, existingProgress.id));
		}
		await syncCourseProgressSummary(input.userId, input.courseId);
		return { remainingAttempts: 0, status: null };
	}

	const recomputed = buildRecomputedAttemptProgress(evidence);
	if (!recomputed) {
		await syncCourseProgressSummary(input.userId, input.courseId);
		return { remainingAttempts: 0, status: null };
	}
	const now = new Date();
	const progressValues = {
		userId: input.userId,
		courseId: input.courseId,
		activityId: input.activityId,
		activityType: input.activityType,
		status: recomputed.status,
		startedAt: recomputed.startedAt,
		lastInteractionAt: recomputed.lastInteractionAt,
		completedAt: recomputed.completedAt,
		attemptsCount: recomputed.attemptsCount,
		timeSpentSeconds: recomputed.timeSpentSeconds,
		metadataJson: JSON.stringify({
			source: 'attempt-delete',
			recomputedAt: now.toISOString(),
			remainingAttempts: recomputed.attemptsCount
		}),
		updatedAt: now
	};

	if (existingProgress) {
		await db
			.update(schema.learningActivityProgress)
			.set(progressValues)
			.where(eq(schema.learningActivityProgress.id, existingProgress.id));
	} else {
		await db.insert(schema.learningActivityProgress).values({
			id: crypto.randomUUID(),
			...progressValues,
			createdAt: now
		});
	}

	await db.insert(schema.learningProgressEvent).values({
		id: crypto.randomUUID(),
		userId: input.userId,
		courseId: input.courseId,
		activityId: input.activityId,
		eventType: 'recomputed_after_attempt_delete',
		eventAt: recomputed.lastInteractionAt,
		source: 'attempt-delete',
		payloadJson: JSON.stringify({
			source: 'attempt-delete',
			status: recomputed.status,
			details: {
				remainingAttempts: recomputed.attemptsCount,
				timeSpentSeconds: recomputed.timeSpentSeconds
			}
		}),
		correlationId: null,
		createdAt: now,
		updatedAt: now
	});

	await syncCourseProgressSummary(input.userId, input.courseId);
	return { remainingAttempts: recomputed.attemptsCount, status: recomputed.status };
}

async function loadLessonProgressEvidence(input: {
	userId: string;
	courseId: string;
	activityId: string;
}): Promise<AttemptProgressEvidence[]> {
	const sessions = await db
		.select()
		.from(schema.interactiveLessonSession)
		.where(
			and(
				eq(schema.interactiveLessonSession.userId, input.userId),
				eq(schema.interactiveLessonSession.courseId, input.courseId),
				eq(schema.interactiveLessonSession.interactiveLearningId, input.activityId),
				eq(schema.interactiveLessonSession.scope, schema.lessonSessionScope.LEARNER),
				isNotNull(schema.interactiveLessonSession.definitionRevisionId)
			)
		)
		.all();

	return sessions.map((session) => ({
		startedAt: session.startedAt,
		lastInteractionAt: session.lastActiveAt,
		completedAt: session.completedAt,
		completed: session.status === schema.lessonAttemptStatus.COMPLETED,
		timeSpentSeconds: estimateDuration(session.startedAt, session.lastActiveAt, session.completedAt)
	}));
}

async function loadChatProgressEvidence(input: {
	userId: string;
	courseId: string;
	activityId: string;
}): Promise<AttemptProgressEvidence[]> {
	const chatLinks = await db
		.select({
			chatId: schema.userInteractiveLearningChat.chatId,
			createdAt: schema.chat.createdAt,
			updatedAt: schema.chat.updatedAt,
			metadata: schema.chat.metadata
		})
		.from(schema.userInteractiveLearningChat)
		.innerJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
		.where(
			and(
				eq(schema.userInteractiveLearningChat.userId, input.userId),
				eq(schema.userInteractiveLearningChat.interactiveLearningChatId, input.activityId)
			)
		)
		.all();
	const chatIds = chatLinks.map((link) => link.chatId);

	if (chatIds.length === 0) return [];

	const assistantDoneMessages = await db
		.select({ chatId: schema.message.chatId })
		.from(schema.message)
		.where(
			and(
				inArray(schema.message.chatId, chatIds),
				eq(schema.message.type, 'ASSISTANT'),
				sql`${schema.message.content} like ${'%[[DONE]]%'}`
			)
		)
		.all();
	const doneChatIds = new Set(assistantDoneMessages.map((message) => message.chatId));
	const messageTimestamps = await db
		.select({ chatId: schema.message.chatId, createdAt: schema.message.createdAt })
		.from(schema.message)
		.where(inArray(schema.message.chatId, chatIds))
		.orderBy(asc(schema.message.createdAt))
		.all();
	const timestampsByChatId = new Map<string, Date[]>();

	for (const row of messageTimestamps) {
		const bucket = timestampsByChatId.get(row.chatId) ?? [];
		bucket.push(row.createdAt);
		timestampsByChatId.set(row.chatId, bucket);
	}

	return chatLinks.map((link) => {
		const timestamps = timestampsByChatId.get(link.chatId) ?? [];
		let timeSpentSeconds = 0;
		for (let index = 1; index < timestamps.length; index += 1) {
			timeSpentSeconds += Math.min(
				15 * 60,
				Math.max(
					0,
					Math.floor((timestamps[index].getTime() - timestamps[index - 1].getTime()) / 1000)
				)
			);
		}
		if (timeSpentSeconds === 0) {
			timeSpentSeconds = estimateDuration(link.createdAt, link.updatedAt, null);
		}

		return {
			startedAt: link.createdAt,
			lastInteractionAt: link.updatedAt,
			completedAt:
				isAgentFinalized(link.metadata) || doneChatIds.has(link.chatId) ? link.updatedAt : null,
			completed: isAgentFinalized(link.metadata) || doneChatIds.has(link.chatId),
			timeSpentSeconds
		};
	});
}

function isAgentFinalized(metadata: string | null): boolean {
	if (!metadata) return false;
	try {
		const parsed = JSON.parse(metadata) as { agentFinalization?: unknown };
		return typeof parsed.agentFinalization === 'object' && parsed.agentFinalization !== null;
	} catch {
		return false;
	}
}

async function assertAndPlanMemoryReverts(chatId: string): Promise<
	{
		canvasId: string;
		previousRevisionId: string | null;
	}[]
> {
	const revisions = await db
		.select()
		.from(schema.agentMemoryCanvasRevision)
		.where(eq(schema.agentMemoryCanvasRevision.sourceChatId, chatId))
		.orderBy(asc(schema.agentMemoryCanvasRevision.createdAt))
		.all();
	const canvasIds = [...new Set(revisions.map((revision) => revision.canvasId))];
	const plans: { canvasId: string; previousRevisionId: string | null }[] = [];

	for (const canvasId of canvasIds) {
		const latest = await db
			.select()
			.from(schema.agentMemoryCanvasRevision)
			.where(eq(schema.agentMemoryCanvasRevision.canvasId, canvasId))
			.orderBy(desc(schema.agentMemoryCanvasRevision.revision))
			.limit(1)
			.get();

		if (latest && latest.sourceChatId !== chatId) {
			throw error(
				409,
				'Este intento modificó memoria persistente y hay revisiones posteriores. Revisa la memoria antes de borrar.'
			);
		}

		const previous = await db
			.select()
			.from(schema.agentMemoryCanvasRevision)
			.where(
				and(
					eq(schema.agentMemoryCanvasRevision.canvasId, canvasId),
					sql`${schema.agentMemoryCanvasRevision.sourceChatId} is not ${chatId}`
				)
			)
			.orderBy(desc(schema.agentMemoryCanvasRevision.revision))
			.limit(1)
			.get();

		plans.push({ canvasId, previousRevisionId: previous?.id ?? null });
	}

	const canvases = await db
		.select()
		.from(schema.agentMemoryCanvas)
		.where(eq(schema.agentMemoryCanvas.lastSourceChatId, chatId))
		.all();

	for (const canvas of canvases) {
		if (!canvasIds.includes(canvas.id) && canvas.revision > 1) {
			throw error(
				409,
				'Este intento aparece como fuente de memoria persistente sin revisión reversible segura.'
			);
		}
	}

	return plans;
}

function applyMemoryReverts(
	tx: DatabaseTransaction,
	plans: { canvasId: string; previousRevisionId: string | null }[],
	chatId: string
): number {
	let reverted = 0;

	for (const plan of plans) {
		if (!plan.previousRevisionId) {
			tx.delete(schema.agentMemoryCanvas)
				.where(eq(schema.agentMemoryCanvas.id, plan.canvasId))
				.run();
			reverted += 1;
			continue;
		}

		const previous = tx
			.select()
			.from(schema.agentMemoryCanvasRevision)
			.where(eq(schema.agentMemoryCanvasRevision.id, plan.previousRevisionId))
			.get();
		if (!previous) continue;

		tx.update(schema.agentMemoryCanvas)
			.set({
				scopeType: previous.scopeType,
				scopeKey: previous.scopeKey,
				courseId: previous.courseId,
				activityId: previous.activityId,
				studentId: previous.studentId,
				visibility: previous.visibility,
				scopeBindings: previous.scopeBindings,
				content: previous.content,
				revision: previous.revision,
				lastSourceChatId: previous.sourceChatId,
				lastSourceToolCallId: previous.sourceToolCallId,
				lastModelName: previous.modelName,
				updatedAt: new Date()
			})
			.where(eq(schema.agentMemoryCanvas.id, plan.canvasId))
			.run();
		reverted += 1;
	}

	tx.delete(schema.agentMemoryCanvasRevision)
		.where(eq(schema.agentMemoryCanvasRevision.sourceChatId, chatId))
		.run();
	tx.delete(schema.agentMemoryCanvasSyncEvent)
		.where(eq(schema.agentMemoryCanvasSyncEvent.chatId, chatId))
		.run();

	return reverted;
}

async function getChatAttempt(input: ChatAttemptDeletionInput) {
	const attempt = await db
		.select({
			linkId: schema.userInteractiveLearningChat.id,
			userId: schema.userInteractiveLearningChat.userId,
			chatId: schema.userInteractiveLearningChat.chatId,
			chatCreatedAt: schema.chat.createdAt
		})
		.from(schema.userInteractiveLearningChat)
		.innerJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
		.where(
			and(
				eq(schema.userInteractiveLearningChat.interactiveLearningChatId, input.activityId),
				eq(schema.userInteractiveLearningChat.chatId, input.chatId)
			)
		)
		.get();

	if (!attempt) throw error(404, 'Intento no encontrado.');

	return attempt;
}

function countRunResult(result: { changes?: number } | undefined): number {
	return result?.changes ?? 0;
}

function deleteChatGraph(tx: DatabaseTransaction, chatIds: string[]): Record<string, number> {
	if (chatIds.length === 0) return {};

	const agentMessageIds = tx
		.select({ id: schema.agentMessage.id })
		.from(schema.agentMessage)
		.where(inArray(schema.agentMessage.chatId, chatIds))
		.all()
		.map((row) => row.id);
	const aiRoundIds = tx
		.select({ id: schema.aiRequestRound.id })
		.from(schema.aiRequestRound)
		.where(inArray(schema.aiRequestRound.chatId, chatIds))
		.all()
		.map((row) => row.id);

	const deletedCounts: Record<string, number> = {};
	if (agentMessageIds.length > 0) {
		deletedCounts.agentUiInstances = countRunResult(
			tx
				.delete(schema.agentUIInstance)
				.where(inArray(schema.agentUIInstance.messageId, agentMessageIds))
				.run()
		);
		deletedCounts.agentToolCalls = countRunResult(
			tx
				.delete(schema.agentToolCall)
				.where(inArray(schema.agentToolCall.messageId, agentMessageIds))
				.run()
		);
	}
	deletedCounts.agentMessages = countRunResult(
		tx.delete(schema.agentMessage).where(inArray(schema.agentMessage.chatId, chatIds)).run()
	);
	deletedCounts.messages = countRunResult(
		tx.delete(schema.message).where(inArray(schema.message.chatId, chatIds)).run()
	);
	deletedCounts.aiUsageLogs = countRunResult(
		tx.delete(schema.aiUsageLog).where(inArray(schema.aiUsageLog.chatId, chatIds)).run()
	);
	if (aiRoundIds.length > 0) {
		deletedCounts.aiUsageLogs += countRunResult(
			tx
				.delete(schema.aiUsageLog)
				.where(inArray(schema.aiUsageLog.requestRoundId, aiRoundIds))
				.run()
		);
	}
	deletedCounts.aiRequestRounds = countRunResult(
		tx.delete(schema.aiRequestRound).where(inArray(schema.aiRequestRound.chatId, chatIds)).run()
	);
	deletedCounts.captureFocus = countRunResult(
		tx
			.delete(schema.aiRequestCaptureFocus)
			.where(
				and(
					eq(schema.aiRequestCaptureFocus.targetType, schema.aiRequestCaptureTargetType.SESSION),
					inArray(schema.aiRequestCaptureFocus.targetId, chatIds)
				)
			)
			.run()
	);
	deletedCounts.chats = countRunResult(
		tx.delete(schema.chat).where(inArray(schema.chat.id, chatIds)).run()
	);

	return deletedCounts;
}

async function logDeletion(input: {
	result: AttemptDeletionResult;
	deletedByUserId: string;
	reason: string | null | undefined;
	primaryAttemptId: string;
	startedAt: Date | null;
}): Promise<void> {
	await auditService.log({
		action: auditAction.ACTIVITY_ATTEMPT_DELETED,
		userId: input.deletedByUserId,
		targetType: 'activity_attempt',
		targetId: input.primaryAttemptId,
		severity: auditSeverity.WARNING,
		details: {
			kind: input.result.kind,
			courseId: input.result.courseId,
			activityId: input.result.activityId,
			userId: input.result.userId,
			chatIds: input.result.chatIds,
			startedAt: input.startedAt?.toISOString() ?? null,
			deletedCounts: input.result.deletedCounts,
			progress: input.result.progress,
			reason: input.reason ?? null
		}
	});
}

export class ActivityAttemptDeletionService {
	static requireDeleteConfirmation = requireDeleteConfirmation;
	static normalizeReason = normalizeReason;

	static async deleteLessonAttempt(
		input: LessonAttemptDeletionInput
	): Promise<AttemptDeletionResult> {
		await requireAdminAccess(input);

		const session = await db
			.select()
			.from(schema.interactiveLessonSession)
			.where(eq(schema.interactiveLessonSession.id, input.sessionId))
			.get();

		if (!session) throw error(404, 'Intento de lesson no encontrado.');
		if (
			session.courseId !== input.courseId ||
			session.interactiveLearningId !== input.activityId ||
			session.scope !== schema.lessonSessionScope.LEARNER
		) {
			throw error(404, 'El intento no pertenece a esta revisión.');
		}

		const chatRows = await db
			.select({ chatId: schema.interactiveLessonBlockVisit.chatId })
			.from(schema.interactiveLessonBlockVisit)
			.where(
				and(
					eq(schema.interactiveLessonBlockVisit.sessionId, input.sessionId),
					isNotNull(schema.interactiveLessonBlockVisit.chatId)
				)
			)
			.all();
		const stateChatRows = await db
			.select({ chatId: schema.interactiveLessonBlockState.chatId })
			.from(schema.interactiveLessonBlockState)
			.where(
				and(
					eq(schema.interactiveLessonBlockState.sessionId, input.sessionId),
					isNotNull(schema.interactiveLessonBlockState.chatId)
				)
			)
			.all();
		const chatIds = [
			...new Set(
				[...chatRows, ...stateChatRows]
					.map((row) => row.chatId)
					.filter((chatId): chatId is string => Boolean(chatId))
			)
		];
		const memoryPlanEntries = await Promise.all(
			chatIds.map(async (chatId) => ({
				chatId,
				plans: await assertAndPlanMemoryReverts(chatId)
			}))
		);

		const deletedCounts = db.transaction((tx) => {
			const counts: Record<string, number> = {};
			for (const entry of memoryPlanEntries) {
				counts.memoryReverts =
					(counts.memoryReverts ?? 0) + applyMemoryReverts(tx, entry.plans, entry.chatId);
			}
			Object.assign(counts, deleteChatGraph(tx, chatIds));
			counts.lessonSessions = countRunResult(
				tx
					.delete(schema.interactiveLessonSession)
					.where(eq(schema.interactiveLessonSession.id, input.sessionId))
					.run()
			);
			return counts;
		});

		const progress = await recomputeActivityProgress({
			userId: session.userId,
			courseId: input.courseId,
			activityId: input.activityId,
			activityType: 'lesson'
		});
		const result = {
			kind: 'lesson',
			courseId: input.courseId,
			activityId: input.activityId,
			userId: session.userId,
			chatIds,
			deletedCounts,
			progress
		} satisfies AttemptDeletionResult;

		await logDeletion({
			result,
			deletedByUserId: input.deletedByUserId,
			reason: input.reason,
			primaryAttemptId: input.sessionId,
			startedAt: session.startedAt
		});

		return result;
	}

	static async deleteChatAttempt(input: ChatAttemptDeletionInput): Promise<AttemptDeletionResult> {
		return this.deleteChatLikeAttempt(input, 'chat');
	}

	static async deleteAgentAttempt(input: ChatAttemptDeletionInput): Promise<AttemptDeletionResult> {
		return this.deleteChatLikeAttempt(input, 'agent');
	}

	private static async deleteChatLikeAttempt(
		input: ChatAttemptDeletionInput,
		kind: 'chat' | 'agent'
	): Promise<AttemptDeletionResult> {
		await requireAdminAccess(input);
		const attempt = await getChatAttempt(input);
		const memoryPlans = await assertAndPlanMemoryReverts(input.chatId);

		const deletedCounts = db.transaction((tx) => {
			const counts: Record<string, number> = {};
			counts.memoryReverts = applyMemoryReverts(tx, memoryPlans, input.chatId);
			counts.userInteractiveLearningChats = countRunResult(
				tx
					.delete(schema.userInteractiveLearningChat)
					.where(eq(schema.userInteractiveLearningChat.id, attempt.linkId))
					.run()
			);
			Object.assign(counts, deleteChatGraph(tx, [input.chatId]));
			return counts;
		});

		const progress = await recomputeActivityProgress({
			userId: attempt.userId,
			courseId: input.courseId,
			activityId: input.activityId,
			activityType: kind
		});
		const result = {
			kind,
			courseId: input.courseId,
			activityId: input.activityId,
			userId: attempt.userId,
			chatIds: [input.chatId],
			deletedCounts,
			progress
		} satisfies AttemptDeletionResult;

		await logDeletion({
			result,
			deletedByUserId: input.deletedByUserId,
			reason: input.reason,
			primaryAttemptId: input.chatId,
			startedAt: attempt.chatCreatedAt
		});

		return result;
	}

	static async getNextLessonReviewSessionUrl(input: {
		courseId: string;
		activityId: string;
		userId: string;
		basePath: string;
	}): Promise<string> {
		const nextSession = await db
			.select({ id: schema.interactiveLessonSession.id })
			.from(schema.interactiveLessonSession)
			.where(
				and(
					eq(schema.interactiveLessonSession.courseId, input.courseId),
					eq(schema.interactiveLessonSession.interactiveLearningId, input.activityId),
					eq(schema.interactiveLessonSession.userId, input.userId),
					eq(schema.interactiveLessonSession.scope, schema.lessonSessionScope.LEARNER),
					isNotNull(schema.interactiveLessonSession.definitionRevisionId)
				)
			)
			.orderBy(
				desc(schema.interactiveLessonSession.attemptNumber),
				desc(schema.interactiveLessonSession.createdAt)
			)
			.limit(1)
			.get();

		return nextSession ? `${input.basePath}/${nextSession.id}` : input.basePath;
	}
}
