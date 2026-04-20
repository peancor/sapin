import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, CourseRoleUtils } from '$lib/server/db';
import {
	interactiveLearningLessonRevision,
	interactiveLessonBlockState,
	interactiveLessonBlockVisit,
	interactiveLessonEvent,
	interactiveLessonSession,
	lessonSessionScope,
	message,
	user
} from '$lib/server/db/schema';
import type {
	InteractiveLessonBlockVisit,
	InteractiveLearning
} from '$lib/server/db/schema';
import type { LessonDefinition } from '$lib/types/lesson';
import type {
	LessonReviewAttemptDetail,
	LessonReviewAudience,
	LessonReviewAttemptSummary,
	LessonReviewStudentDetail,
	LessonReviewStudentDetailSummary,
	LessonReviewStudentDirectorySummary,
	LessonReviewStudent,
	LessonReviewStudentRow,
	LessonReviewVisitAgentMessage,
	LessonReviewVisitDetail
} from '$lib/types/lessonReview';
import { LessonServiceError } from './LessonServiceError';
import {
	buildLessonReviewAttemptSummary,
	coerceBoolean,
	coerceNumber,
	parseJsonRecord
} from './LessonReviewUtils';
import { LessonRevisionService } from './LessonRevisionService';

type CourseParticipant = LessonReviewStudent;

type AttemptHistoryLoadResult = {
	attempts: LessonReviewAttemptSummary[];
};

function stripMarkdown(value: string): string {
	return value
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/^>\s?/gm, '')
		.replace(/[#*_~-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function createSnippet(value: string | null | undefined, maxLength = 180): string | null {
	if (!value) return null;
	const clean = stripMarkdown(value);
	if (!clean) return null;
	return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}…` : clean;
}

function sortAttemptsDescending(
	left: LessonReviewAttemptSummary,
	right: LessonReviewAttemptSummary
): number {
	return (
		right.attemptNumber - left.attemptNumber ||
		right.lastActiveAt.getTime() - left.lastActiveAt.getTime()
	);
}

export function buildLessonReviewStudentRows(input: {
	participants: LessonReviewStudent[];
	attemptsByUser: Map<string, LessonReviewAttemptSummary[]>;
}): LessonReviewStudentRow[] {
	return input.participants
		.map((student) => {
			const attempts = [...(input.attemptsByUser.get(student.id) ?? [])].sort(sortAttemptsDescending);

			return {
				student,
				latestAttempt: attempts[0] ?? null,
				previousAttempts: attempts.slice(1),
				totalAttempts: attempts.length,
				hasAnyActivity: attempts.length > 0
			} satisfies LessonReviewStudentRow;
		})
		.sort((left, right) => {
			const rightTime =
				right.latestAttempt?.lastActiveAt.getTime() ?? Number.NEGATIVE_INFINITY;
			const leftTime =
				left.latestAttempt?.lastActiveAt.getTime() ?? Number.NEGATIVE_INFINITY;
			if (rightTime !== leftTime) return rightTime - leftTime;
			return left.student.username.localeCompare(right.student.username, 'es');
		});
}

export function buildLessonReviewStudentDirectory(
	rows: LessonReviewStudentRow[]
): {
	students: LessonReviewStudentRow[];
	summary: LessonReviewStudentDirectorySummary;
} {
	const students = rows.filter((row) => row.student.audience === 'student');
	const attempts = students.flatMap((row) =>
		row.latestAttempt ? [row.latestAttempt, ...row.previousAttempts] : row.previousAttempts
	);
	const lastActivityAt = students.reduce<Date | null>((latest, row) => {
		const candidate = row.latestAttempt?.lastActiveAt ?? null;
		if (!candidate) return latest;
		if (!latest || candidate.getTime() > latest.getTime()) return candidate;
		return latest;
	}, null);

	return {
		students,
		summary: {
			totalStudents: students.length,
			studentsWithAttempts: students.filter((student) => student.hasAnyActivity).length,
			studentsCompleted: students.filter(
				(student) => student.latestAttempt?.reviewStatus === 'completed'
			).length,
			studentsWithAlerts: students.filter(
				(student) => (student.latestAttempt?.alerts.length ?? 0) > 0
			).length,
			totalAttempts: attempts.length,
			lastActivityAt
		}
	};
}

export function requireLessonReviewStudent(
	participants: LessonReviewStudent[],
	studentId: string
): LessonReviewStudent {
	const participant = participants.find((entry) => entry.id === studentId);

	if (!participant) {
		throw new LessonServiceError(404, 'Alumno no encontrado.');
	}

	if (participant.audience !== 'student') {
		throw new LessonServiceError(
			404,
			'El participante no forma parte del alumnado de esta lesson.'
		);
	}

	return participant;
}

export function buildLessonReviewStudentDetail(input: {
	student: LessonReviewStudent;
	attempts: LessonReviewAttemptSummary[];
}): LessonReviewStudentDetail {
	const attempts = [...input.attempts].sort(sortAttemptsDescending);
	const summary = attempts.reduce<LessonReviewStudentDetailSummary>(
		(accumulator, attempt) => {
			accumulator.totalAttempts += 1;
			if (attempt.reviewStatus === 'completed') accumulator.completedAttempts += 1;
			if (attempt.reviewStatus === 'active') accumulator.activeAttempts += 1;
			if (attempt.alerts.length > 0) accumulator.attemptsWithAlerts += 1;
			accumulator.totalAlerts += attempt.alerts.length;
			accumulator.totalVisitedBlocks += attempt.visitedBlocksCount;
			accumulator.totalChecksPassed += attempt.checksPassed;
			accumulator.totalChecksPending += attempt.checksPending;
			accumulator.totalBranches += attempt.branchCount;
			accumulator.totalRevisitedBlocks += attempt.revisitedBlocks;
			accumulator.totalCheckRetryBlocks += attempt.checkRetryBlocks;
			if (
				!accumulator.lastActivityAt ||
				attempt.lastActiveAt.getTime() > accumulator.lastActivityAt.getTime()
			) {
				accumulator.lastActivityAt = attempt.lastActiveAt;
			}
			return accumulator;
		},
		{
			totalAttempts: 0,
			completedAttempts: 0,
			activeAttempts: 0,
			attemptsWithAlerts: 0,
			totalAlerts: 0,
			totalVisitedBlocks: 0,
			totalChecksPassed: 0,
			totalChecksPending: 0,
			totalBranches: 0,
			totalRevisitedBlocks: 0,
			totalCheckRetryBlocks: 0,
			lastActivityAt: null
		}
	);

	return {
		student: input.student,
		latestAttempt: attempts[0] ?? null,
		attempts,
		summary
	};
}

export class LessonReviewService {
	static async getCohortOverview(input: {
		courseId: string;
		activity: InteractiveLearning;
	}): Promise<{
		activity: InteractiveLearning;
		definition: LessonDefinition;
		students: LessonReviewStudentRow[];
		summary: {
			totalStudents: number;
			studentsWithAttempts: number;
			studentsCompleted: number;
			studentsWithAlerts: number;
		};
	}> {
		const { definition, rows } = await this.loadActivityRows(input.courseId, input.activity);
		const directory = buildLessonReviewStudentDirectory(rows);

		return {
			activity: input.activity,
			definition,
			students: rows,
			summary: {
				totalStudents: directory.summary.totalStudents,
				studentsWithAttempts: directory.summary.studentsWithAttempts,
				studentsCompleted: directory.summary.studentsCompleted,
				studentsWithAlerts: directory.summary.studentsWithAlerts
			}
		};
	}

	static async getStudentDirectory(input: {
		courseId: string;
		activity: InteractiveLearning;
	}): Promise<{
		activity: InteractiveLearning;
		definition: LessonDefinition;
		students: LessonReviewStudentRow[];
		summary: LessonReviewStudentDirectorySummary;
	}> {
		const { definition, rows } = await this.loadActivityRows(input.courseId, input.activity);
		const directory = buildLessonReviewStudentDirectory(rows);

		return {
			activity: input.activity,
			definition,
			students: directory.students,
			summary: directory.summary
		};
	}

	static async getStudentDetail(input: {
		courseId: string;
		activity: InteractiveLearning;
		studentId: string;
	}): Promise<LessonReviewStudentDetail> {
		const participants = await this.getCourseParticipants(input.courseId);
		const student = requireLessonReviewStudent(participants, input.studentId);
		const { attempts } = await this.loadAttemptHistoryForUser({
			courseId: input.courseId,
			activity: input.activity,
			userId: input.studentId
		});

		return buildLessonReviewStudentDetail({
			student,
			attempts
		});
	}

	static async getAttemptDetail(input: {
		courseId: string;
		activity: InteractiveLearning;
		sessionId: string;
	}): Promise<LessonReviewAttemptDetail> {
		const session = await db
			.select()
			.from(interactiveLessonSession)
			.where(eq(interactiveLessonSession.id, input.sessionId))
			.get();

		if (!session) {
			throw new LessonServiceError(404, 'Intento de lesson no encontrado.');
		}

		if (
			session.courseId !== input.courseId ||
			session.interactiveLearningId !== input.activity.id
		) {
			throw new LessonServiceError(404, 'El intento no pertenece a esta lesson.');
		}

		if (session.scope !== lessonSessionScope.LEARNER) {
			throw new LessonServiceError(404, 'El intento solicitado no forma parte de la revisión learner.');
		}

		const resolvedSession = await LessonRevisionService.ensureSessionRevisionBinding(session);

		const participants = await this.getCourseParticipants(input.courseId);
		const participantById = new Map(participants.map((participant) => [participant.id, participant]));
		const studentRecord =
			participantById.get(resolvedSession.userId) ??
			(await this.getFallbackParticipant(resolvedSession.userId));

		if (!studentRecord) {
			throw new LessonServiceError(404, 'Alumno no encontrado.');
		}

		const { definition } = await LessonRevisionService.resolveLessonDefinitionForSession({
			sessionId: resolvedSession.id
		});
		const { attempts } = await this.loadAttemptHistoryForUser({
			courseId: input.courseId,
			activity: input.activity,
			userId: resolvedSession.userId
		});

		const attempt = attempts.find((item) => item.sessionId === input.sessionId);
		if (!attempt) {
			throw new LessonServiceError(404, 'No se pudo reconstruir el intento solicitado.');
		}

		const [sessionVisitsRaw, sessionEvents] = await Promise.all([
			db
				.select()
				.from(interactiveLessonBlockVisit)
				.where(eq(interactiveLessonBlockVisit.sessionId, input.sessionId))
				.all(),
			db
				.select()
				.from(interactiveLessonEvent)
				.where(eq(interactiveLessonEvent.sessionId, input.sessionId))
				.all()
		]);
		const sessionVisits = sessionVisitsRaw.sort((left, right) => left.visitNumber - right.visitNumber);
		const branchEventByVisitId = new Map(
			sessionEvents
				.filter((event) => event.eventType === 'branch_taken' && event.visitId)
				.map((event) => [event.visitId as string, event])
		);
		const transcriptMessages = await this.loadVisitTranscripts(sessionVisits);
		const blockMap = new Map(definition.blocks.map((block) => [block.id, block]));

		return {
			student: studentRecord,
			attempt,
			history: attempts,
			timeline: sessionVisits.map((visit) => {
				const block = blockMap.get(visit.blockId);
				const outputs = parseJsonRecord(visit.outputsJson);
				const branchEvent = branchEventByVisitId.get(visit.id);
				const branchPayload = parseJsonRecord(branchEvent?.payloadJson);
				const transcript = transcriptMessages.get(visit.id) ?? [];
				const agentSummary =
					createSnippet(
						transcript.map((message) => `${message.role === 'USER' ? 'Alumno' : 'IA'}: ${message.content}`).join(' ')
					) ?? createSnippet(String(outputs.response ?? ''));

				return {
					visitId: visit.id,
					visitNumber: visit.visitNumber,
					blockId: visit.blockId,
					blockTitle: block?.title ?? visit.blockId,
					blockKind: block?.kind ?? 'content',
					status: visit.status,
					enteredAt: visit.enteredAt,
					completedAt: visit.completedAt ?? null,
					branchTargetBlockId:
						typeof branchPayload.targetBlockId === 'string' ? branchPayload.targetBlockId : null,
					branchLabel:
						typeof branchPayload.label === 'string' ? branchPayload.label : null,
					contentSummary:
						block && 'body' in block ? createSnippet(block.body) : null,
					choice:
						block?.kind === 'choice'
							? {
									selectedLabel:
										typeof outputs.selectedLabel === 'string' ? outputs.selectedLabel : null,
									selectedValue:
										typeof outputs.selectedValue === 'string'
											? outputs.selectedValue
											: typeof visit.lastChoiceValue === 'string'
												? visit.lastChoiceValue
												: null,
									targetBlockId:
										typeof branchPayload.targetBlockId === 'string'
											? branchPayload.targetBlockId
											: null
							  }
							: null,
					check:
						block?.kind === 'check'
							? {
									score: coerceNumber(outputs.score),
									passed: coerceBoolean(outputs.passed),
									feedback:
										typeof outputs.feedback === 'string' ? outputs.feedback : null,
									attemptCount: coerceNumber(outputs.attemptCount) ?? 0,
									attemptsRemaining: coerceNumber(outputs.attemptsRemaining)
							  }
							: null,
					agent:
						block?.kind === 'agent'
							? {
									transcript,
									summary: agentSummary
							  }
							: null
				} satisfies LessonReviewVisitDetail;
			})
		};
	}

	private static async loadActivityRows(
		courseId: string,
		activity: InteractiveLearning
	): Promise<{
		definition: LessonDefinition;
		rows: LessonReviewStudentRow[];
	}> {
		const courseParticipants = await this.getCourseParticipants(courseId);
		const sessions = await db
			.select()
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.courseId, courseId),
					eq(interactiveLessonSession.interactiveLearningId, activity.id),
					eq(interactiveLessonSession.scope, lessonSessionScope.LEARNER),
					isNotNull(interactiveLessonSession.definitionRevisionId)
				)
			)
			.all();
		const boundSessions = await Promise.all(
			sessions.map((session) => LessonRevisionService.ensureSessionRevisionBinding(session))
		);
		const revisionState = await LessonRevisionService.ensureLessonRevisionState(activity.id);
		const definitionsByRevisionId = await this.loadDefinitionsByRevisionId(
			boundSessions.map((session) => session.definitionRevisionId)
		);

		const sessionIds = boundSessions.map((session) => session.id);
		const [blockStates, blockVisits, events] = await Promise.all([
			sessionIds.length
				? db
						.select()
						.from(interactiveLessonBlockState)
						.where(inArray(interactiveLessonBlockState.sessionId, sessionIds))
						.all()
				: [],
			sessionIds.length
				? db
						.select()
						.from(interactiveLessonBlockVisit)
						.where(inArray(interactiveLessonBlockVisit.sessionId, sessionIds))
						.all()
				: [],
			sessionIds.length
				? db
						.select()
						.from(interactiveLessonEvent)
						.where(inArray(interactiveLessonEvent.sessionId, sessionIds))
						.all()
				: []
		]);

		const statesBySession = this.groupBy(blockStates, (item) => item.sessionId);
		const visitsBySession = this.groupBy(blockVisits, (item) => item.sessionId);
		const eventsBySession = this.groupBy(events, (item) => item.sessionId);
		const attemptsByUser = new Map<string, LessonReviewAttemptSummary[]>();

		for (const session of boundSessions) {
			const definition =
				(session.definitionRevisionId
					? definitionsByRevisionId.get(session.definitionRevisionId)
					: null) ?? revisionState.publishedDefinition;
			const attempt = buildLessonReviewAttemptSummary({
				definition,
				session,
				blockStates: statesBySession.get(session.id) ?? [],
				blockVisits: (visitsBySession.get(session.id) ?? []).sort(
					(left, right) => left.visitNumber - right.visitNumber
				),
				events: eventsBySession.get(session.id) ?? []
			});
			const bucket = attemptsByUser.get(session.userId) ?? [];
			bucket.push(attempt);
			attemptsByUser.set(session.userId, bucket);
		}

		return {
			definition: revisionState.publishedDefinition,
			rows: buildLessonReviewStudentRows({
				participants: courseParticipants,
				attemptsByUser
			})
		};
	}

	private static async loadAttemptHistoryForUser(input: {
		courseId: string;
		activity: InteractiveLearning;
		userId: string;
	}): Promise<AttemptHistoryLoadResult> {
		const historySessions = await db
			.select()
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.courseId, input.courseId),
					eq(interactiveLessonSession.interactiveLearningId, input.activity.id),
					eq(interactiveLessonSession.userId, input.userId),
					eq(interactiveLessonSession.scope, lessonSessionScope.LEARNER),
					isNotNull(interactiveLessonSession.definitionRevisionId)
				)
			)
			.all();
		const boundSessions = await Promise.all(
			historySessions.map((session) => LessonRevisionService.ensureSessionRevisionBinding(session))
		);

		if (boundSessions.length === 0) {
			return {
				attempts: []
			};
		}

		const historySessionIds = boundSessions.map((item) => item.id);
		const [blockStates, blockVisits, events] = await Promise.all([
			db
				.select()
				.from(interactiveLessonBlockState)
				.where(inArray(interactiveLessonBlockState.sessionId, historySessionIds))
				.all(),
			db
				.select()
				.from(interactiveLessonBlockVisit)
				.where(inArray(interactiveLessonBlockVisit.sessionId, historySessionIds))
				.all(),
			db
				.select()
				.from(interactiveLessonEvent)
				.where(inArray(interactiveLessonEvent.sessionId, historySessionIds))
				.all()
		]);
		const revisionState = await LessonRevisionService.ensureLessonRevisionState(input.activity.id);
		const definitionsByRevisionId = await this.loadDefinitionsByRevisionId(
			boundSessions.map((session) => session.definitionRevisionId)
		);

		const statesBySession = this.groupBy(blockStates, (item) => item.sessionId);
		const visitsBySession = this.groupBy(blockVisits, (item) => item.sessionId);
		const eventsBySession = this.groupBy(events, (item) => item.sessionId);
		const attempts = boundSessions
			.map((historySession) =>
				buildLessonReviewAttemptSummary({
					definition:
						(historySession.definitionRevisionId
							? definitionsByRevisionId.get(historySession.definitionRevisionId)
							: null) ?? revisionState.publishedDefinition,
					session: historySession,
					blockStates: statesBySession.get(historySession.id) ?? [],
					blockVisits: (visitsBySession.get(historySession.id) ?? []).sort(
						(left, right) => left.visitNumber - right.visitNumber
					),
					events: eventsBySession.get(historySession.id) ?? []
				})
			)
			.sort(sortAttemptsDescending);

		return {
			attempts
		};
	}

	private static async loadDefinitionsByRevisionId(
		revisionIds: Array<string | null | undefined>
	): Promise<Map<string, LessonDefinition>> {
		const ids = [...new Set(revisionIds.filter((revisionId): revisionId is string => Boolean(revisionId)))];
		if (ids.length === 0) {
			return new Map();
		}

		const revisions = await db
			.select()
			.from(interactiveLearningLessonRevision)
			.where(inArray(interactiveLearningLessonRevision.id, ids))
			.all();

		return new Map(
			revisions.map((revision) => [
				revision.id,
				LessonRevisionService.parseDefinition(revision.definitionJson)
			])
		);
	}

	private static async getCourseParticipants(courseId: string): Promise<CourseParticipant[]> {
		const courseUsers = await CourseRoleUtils.getCourseUsers(courseId);
		const participantById = new Map<string, CourseParticipant>();

		for (const userRecord of courseUsers) {
			const existing = participantById.get(userRecord.userId);
			if (existing && existing.courseRoleLevel >= userRecord.level) continue;

			participantById.set(userRecord.userId, {
				id: userRecord.userId,
				username: userRecord.username || userRecord.alias || 'Sin nombre',
				email: userRecord.email,
				image: userRecord.image,
				alias: userRecord.alias,
				courseRole: userRecord.role,
				courseRoleLevel: userRecord.level,
				audience: this.resolveAudience(userRecord.role, userRecord.level)
			});
		}

		return [...participantById.values()];
	}

	private static async getFallbackParticipant(userId: string): Promise<CourseParticipant | null> {
		const userRecord = await db.select().from(user).where(eq(user.id, userId)).get();
		if (!userRecord) return null;

		return {
			id: userRecord.id,
			username: userRecord.username || userRecord.alias || 'Sin nombre',
			email: userRecord.email,
			image: userRecord.image,
			alias: userRecord.alias,
			courseRole: 'sin_rol_activo',
			courseRoleLevel: 0,
			audience: 'student'
		};
	}

	private static resolveAudience(role: string, level: number): LessonReviewAudience {
		return role === 'student' || level <= 10 ? 'student' : 'staff';
	}

	private static async loadVisitTranscripts(
		visits: InteractiveLessonBlockVisit[]
	): Promise<Map<string, LessonReviewVisitAgentMessage[]>> {
		const chatVisitPairs = visits
			.filter((visit) => visit.chatId)
			.map((visit) => ({ visitId: visit.id, chatId: visit.chatId as string }));
		const chatIds = [...new Set(chatVisitPairs.map((pair) => pair.chatId))];

		if (chatIds.length === 0) {
			return new Map();
		}

		const messages = await db
			.select()
			.from(message)
			.where(inArray(message.chatId, chatIds))
			.all();
		const visitIdByChatId = new Map(chatVisitPairs.map((pair) => [pair.chatId, pair.visitId]));
		const transcriptByVisitId = new Map<string, LessonReviewVisitAgentMessage[]>();

		for (const row of messages) {
			const visitId = visitIdByChatId.get(row.chatId);
			if (!visitId || (row.type !== 'USER' && row.type !== 'ASSISTANT')) continue;

			const bucket = transcriptByVisitId.get(visitId) ?? [];
			bucket.push({
				id: row.id,
				role: row.type,
				content: row.content,
				createdAt: row.createdAt
			});
			transcriptByVisitId.set(visitId, bucket);
		}

		for (const bucket of transcriptByVisitId.values()) {
			bucket.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
		}

		return transcriptByVisitId;
	}

	private static groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
		const grouped = new Map<string, T[]>();
		for (const item of items) {
			const key = getKey(item);
			const bucket = grouped.get(key) ?? [];
			bucket.push(item);
			grouped.set(key, bucket);
		}
		return grouped;
	}
}
