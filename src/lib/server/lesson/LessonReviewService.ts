import { and, eq, inArray } from 'drizzle-orm';
import { db, CourseRoleUtils } from '$lib/server/db';
import {
	interactiveLessonBlockState,
	interactiveLessonBlockVisit,
	interactiveLessonEvent,
	interactiveLessonSession,
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
	LessonReviewAttemptSummary,
	LessonReviewStudent,
	LessonReviewStudentRow,
	LessonReviewVisitAgentMessage,
	LessonReviewVisitDetail
} from '$lib/types/lessonReview';
import { LessonService } from './LessonService';
import { LessonServiceError } from './LessonServiceError';
import {
	buildLessonReviewAttemptSummary,
	coerceBoolean,
	coerceNumber,
	parseJsonRecord
} from './LessonReviewUtils';

type CourseStudent = LessonReviewStudent;

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
		const definition = LessonService.parseDefinition(input.activity.content);
		const courseStudents = await this.getCourseStudents(input.courseId);
		const sessions = await db
			.select()
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.courseId, input.courseId),
					eq(interactiveLessonSession.interactiveLearningId, input.activity.id)
				)
			)
			.all();

		const sessionIds = sessions.map((session) => session.id);
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

		for (const session of sessions) {
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

		const students = courseStudents.map((student) => {
			const attempts = (attemptsByUser.get(student.id) ?? []).sort(
				(left, right) =>
					right.attemptNumber - left.attemptNumber ||
					right.lastActiveAt.getTime() - left.lastActiveAt.getTime()
			);

			return {
				student,
				latestAttempt: attempts[0] ?? null,
				previousAttempts: attempts.slice(1),
				totalAttempts: attempts.length,
				hasAnyActivity: attempts.length > 0
			} satisfies LessonReviewStudentRow;
		})
		.sort((left, right) => {
			const rightTime = right.latestAttempt?.lastActiveAt.getTime() ?? Number.NEGATIVE_INFINITY;
			const leftTime = left.latestAttempt?.lastActiveAt.getTime() ?? Number.NEGATIVE_INFINITY;
			if (rightTime !== leftTime) return rightTime - leftTime;
			return left.student.username.localeCompare(right.student.username, 'es');
		});

		return {
			activity: input.activity,
			definition,
			students,
			summary: {
				totalStudents: students.length,
				studentsWithAttempts: students.filter((student) => student.hasAnyActivity).length,
				studentsCompleted: students.filter(
					(student) => student.latestAttempt?.reviewStatus === 'completed'
				).length,
				studentsWithAlerts: students.filter(
					(student) => (student.latestAttempt?.alerts.length ?? 0) > 0
				).length
			}
		};
	}

	static async getAttemptDetail(input: {
		courseId: string;
		activity: InteractiveLearning;
		sessionId: string;
	}): Promise<LessonReviewAttemptDetail> {
		const definition = LessonService.parseDefinition(input.activity.content);
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

		const studentRecord = await db
			.select()
			.from(user)
			.where(eq(user.id, session.userId))
			.get();

		if (!studentRecord) {
			throw new LessonServiceError(404, 'Alumno no encontrado.');
		}

		const historySessions = await db
			.select()
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.courseId, input.courseId),
					eq(interactiveLessonSession.interactiveLearningId, input.activity.id),
					eq(interactiveLessonSession.userId, session.userId)
				)
			)
			.all();

		const historySessionIds = historySessions.map((item) => item.id);
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

		const statesBySession = this.groupBy(blockStates, (item) => item.sessionId);
		const visitsBySession = this.groupBy(blockVisits, (item) => item.sessionId);
		const eventsBySession = this.groupBy(events, (item) => item.sessionId);
		const attemptHistory = historySessions
			.map((historySession) =>
				buildLessonReviewAttemptSummary({
					definition,
					session: historySession,
					blockStates: statesBySession.get(historySession.id) ?? [],
					blockVisits: (visitsBySession.get(historySession.id) ?? []).sort(
						(left, right) => left.visitNumber - right.visitNumber
					),
					events: eventsBySession.get(historySession.id) ?? []
				})
			)
			.sort(
				(left, right) =>
					right.attemptNumber - left.attemptNumber ||
					right.lastActiveAt.getTime() - left.lastActiveAt.getTime()
			);

		const attempt = attemptHistory.find((item) => item.sessionId === input.sessionId);
		if (!attempt) {
			throw new LessonServiceError(404, 'No se pudo reconstruir el intento solicitado.');
		}

		const sessionVisits = (visitsBySession.get(input.sessionId) ?? []).sort(
			(left, right) => left.visitNumber - right.visitNumber
		);
		const sessionEvents = eventsBySession.get(input.sessionId) ?? [];
		const branchEventByVisitId = new Map(
			sessionEvents
				.filter((event) => event.eventType === 'branch_taken' && event.visitId)
				.map((event) => [event.visitId as string, event])
		);
		const transcriptMessages = await this.loadVisitTranscripts(sessionVisits);
		const blockMap = new Map(definition.blocks.map((block) => [block.id, block]));

		return {
			student: {
				id: studentRecord.id,
				username: studentRecord.username || studentRecord.alias || 'Sin nombre',
				email: studentRecord.email,
				image: studentRecord.image,
				alias: studentRecord.alias
			},
			attempt,
			history: attemptHistory,
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

	private static async getCourseStudents(courseId: string): Promise<CourseStudent[]> {
		const courseUsers = await CourseRoleUtils.getCourseUsers(courseId);
		return courseUsers
			.filter((userRecord) => userRecord.role === 'student')
			.map((userRecord) => ({
				id: userRecord.userId,
				username: userRecord.username || userRecord.alias || 'Sin nombre',
				email: userRecord.email,
				image: userRecord.image,
				alias: userRecord.alias
			}));
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
