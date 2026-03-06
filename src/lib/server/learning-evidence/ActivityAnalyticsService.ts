import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import type {
	LearningEvidenceAccessContext,
	LearningEvidenceActivityContext,
	LearningEvidenceRosterEntry,
	LearningEvidenceStudentRef,
	LearningEvidenceTranscriptMessage,
	LearningEvidenceTranscriptSession
} from '$lib/types/learningEvidence';

type ProgressRow = typeof schema.learningActivityProgress.$inferSelect;
type TimelineBucket = 'day' | 'week';
type RiskLevel = 'low' | 'medium' | 'high';

interface ActivityAnalyticsQuery {
	activityId: string;
	studentIds?: string[];
	chatIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	search?: string;
}

interface StudentActivityMetrics {
	status: schema.LearningActivityStatusType | 'not_started';
	sessionCount: number;
	totalMessages: number;
	learnerMessageCount: number;
	assistantMessageCount: number;
	toolCallCount: number;
	uiResponseCount: number;
	averageLearnerMessageLength: number;
	attemptsCount: number;
	timeSpentSeconds: number;
	firstActivityAt: string | null;
	lastActivityAt: string | null;
	engagementScore: number;
	riskLevel: RiskLevel;
}

interface StudentActivityRecord {
	student: LearningEvidenceStudentRef;
	sessions: LearningEvidenceTranscriptSession[];
	progress: ProgressRow | null;
	metrics: StudentActivityMetrics;
}

interface LoadedActivityData {
	activity: LearningEvidenceActivityContext;
	roster: LearningEvidenceRosterEntry[];
	transcripts: LearningEvidenceTranscriptSession[];
	progressRows: ProgressRow[];
	students: StudentActivityRecord[];
}

interface ToolCallAggregate {
	toolCallId: string;
	toolName: string;
	toolDisplayName: string;
	studentId: string;
	status: string | null;
	failed: boolean;
	durationMs: number | null;
}

const TOOL_USAGE_LIMIT = 10;
const STUCK_MIN_SCORE = 35;
const STUCK_MAX_RESULTS = 12;
const DEFAULT_TIMELINE_LIMIT = 30;

const STOPWORDS = new Set([
	'about',
	'after',
	'algunas',
	'algunos',
	'ante',
	'antes',
	'between',
	'como',
	'con',
	'contra',
	'cual',
	'cuales',
	'cuando',
	'desde',
	'donde',
	'esta',
	'estan',
	'este',
	'estos',
	'for',
	'from',
	'hacia',
	'hasta',
	'into',
	'para',
	'pero',
	'por',
	'porque',
	'puede',
	'pueden',
	'sobre',
	'tengo',
	'tiene',
	'through',
	'under',
	'that',
	'this',
	'very',
	'with'
]);

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function average(values: number[]): number {
	if (values.length === 0) return 0;
	return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeIdList(values?: string[]): string[] {
	if (!Array.isArray(values)) return [];
	return [
		...new Set(
			values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		)
	];
}

function sortStudentsByName(records: StudentActivityRecord[]): StudentActivityRecord[] {
	return [...records].sort((a, b) => a.student.username.localeCompare(b.student.username));
}

function getLatestIso(values: Array<string | null | undefined>): string | null {
	return values.reduce<string | null>((latest, current) => {
		if (!current) return latest;
		if (!latest) return current;
		return new Date(current) > new Date(latest) ? current : latest;
	}, null);
}

function getEarliestIso(values: Array<string | null | undefined>): string | null {
	return values.reduce<string | null>((earliest, current) => {
		if (!current) return earliest;
		if (!earliest) return current;
		return new Date(current) < new Date(earliest) ? current : earliest;
	}, null);
}

function normalizeComparableText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{Mark}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function truncateText(value: string, maxLength = 180): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1)}…`;
}

function toBucketStart(dateIso: string, bucket: TimelineBucket): string {
	const date = new Date(dateIso);
	if (bucket === 'day') {
		return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
	}

	const day = date.getUTCDay() || 7;
	const diffToMonday = day - 1;
	const monday = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diffToMonday)
	);
	return monday.toISOString();
}

function computeEngagementScore(metrics: {
	sessionCount: number;
	learnerMessageCount: number;
	averageLearnerMessageLength: number;
	lastActivityAt: string | null;
}): number {
	if (metrics.sessionCount === 0 || metrics.learnerMessageCount === 0) return 0;

	let score = 0;
	score += Math.min(metrics.learnerMessageCount * 10, 40);
	score += Math.min(Math.round(metrics.averageLearnerMessageLength / 8), 25);
	score += Math.min(metrics.sessionCount * 10, 20);

	if (metrics.lastActivityAt) {
		const daysSinceActivity =
			(Date.now() - new Date(metrics.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
		score += Math.max(15 - daysSinceActivity * 2, 0);
	}

	return clamp(Math.round(score), 0, 100);
}

function computeRiskLevel(score: number, status: StudentActivityMetrics['status']): RiskLevel {
	if (status === 'abandoned') return 'high';
	if (score < 30 || status === 'not_started') return 'high';
	if (score < 60 || status === 'in_progress') return 'medium';
	return 'low';
}

function buildSessionExcerpt(session: LearningEvidenceTranscriptSession): string[] {
	return session.messages
		.slice(-4)
		.map((message) => `${message.role}: ${truncateText(message.displayText, 140)}`);
}

function extractRepeatedLearnerTurns(messages: LearningEvidenceTranscriptMessage[]): number {
	const seen = new Map<string, number>();
	let repeated = 0;

	for (const message of messages) {
		if (message.role !== 'user') continue;
		const normalized = normalizeComparableText(message.displayText);
		if (normalized.length < 12) continue;
		const count = seen.get(normalized) ?? 0;
		if (count >= 1) repeated++;
		seen.set(normalized, count + 1);
	}

	return repeated;
}

function extractTopTerms(
	transcripts: LearningEvidenceTranscriptSession[],
	limit: number
): Array<{ term: string; count: number }> {
	const counts = new Map<string, number>();

	for (const session of transcripts) {
		for (const message of session.messages) {
			if (message.role !== 'user') continue;
			for (const token of normalizeComparableText(message.displayText).split(' ')) {
				if (token.length < 5 || STOPWORDS.has(token)) continue;
				counts.set(token, (counts.get(token) ?? 0) + 1);
			}
		}
	}

	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([term, count]) => ({ term, count }));
}

function collectToolUsage(transcripts: LearningEvidenceTranscriptSession[], limit = TOOL_USAGE_LIMIT) {
	const callMap = new Map<string, ToolCallAggregate>();
	const tools = new Map<
		string,
		{
			toolName: string;
			toolDisplayName: string;
			totalCalls: number;
			completedCalls: number;
			failedCalls: number;
			pendingCalls: number;
			totalDurationMs: number;
			durationSamples: number;
			studentIds: Set<string>;
		}
	>();
	const components = new Map<
		string,
		{
			componentKey: string;
			renderCount: number;
			responseCount: number;
			totalScore: number;
			scoreSamples: number;
			studentIds: Set<string>;
		}
	>();
	const studentUsage = new Map<
		string,
		{
			student: LearningEvidenceStudentRef;
			toolCalls: number;
			failedToolCalls: number;
			uiResponses: number;
			distinctTools: Set<string>;
		}
	>();

	for (const session of transcripts) {
		for (const message of session.messages) {
			for (const part of message.parts) {
				if (part.kind === 'tool-call') {
					callMap.set(part.toolCallId, {
						toolCallId: part.toolCallId,
						toolName: part.toolName,
						toolDisplayName: part.toolDisplayName,
						studentId: session.student.userId,
						status: part.status,
						failed: part.status === 'failed',
						durationMs: null
					});
				}

				if (part.kind === 'tool-result' && part.toolCallId) {
					const current = callMap.get(part.toolCallId);
					callMap.set(part.toolCallId, {
						toolCallId: part.toolCallId,
						toolName: current?.toolName ?? part.toolName,
						toolDisplayName: current?.toolDisplayName ?? part.toolDisplayName,
						studentId: current?.studentId ?? session.student.userId,
						status: part.status ?? current?.status ?? null,
						failed: Boolean(part.errorMessage) || part.status === 'failed',
						durationMs: part.durationMs ?? current?.durationMs ?? null
					});
				}

				if (part.kind === 'ui-component') {
					const current = components.get(part.componentKey) ?? {
						componentKey: part.componentKey,
						renderCount: 0,
						responseCount: 0,
						totalScore: 0,
						scoreSamples: 0,
						studentIds: new Set<string>()
					};
					current.renderCount++;
					current.studentIds.add(session.student.userId);
					components.set(part.componentKey, current);
				}

				if (part.kind === 'ui-response') {
					const current = components.get(part.componentKey) ?? {
						componentKey: part.componentKey,
						renderCount: 0,
						responseCount: 0,
						totalScore: 0,
						scoreSamples: 0,
						studentIds: new Set<string>()
					};
					current.responseCount++;
					current.studentIds.add(session.student.userId);
					if (typeof part.score === 'number') {
						current.totalScore += part.score;
						current.scoreSamples++;
					}
					components.set(part.componentKey, current);

					const student = studentUsage.get(session.student.userId) ?? {
						student: session.student,
						toolCalls: 0,
						failedToolCalls: 0,
						uiResponses: 0,
						distinctTools: new Set<string>()
					};
					student.uiResponses++;
					studentUsage.set(session.student.userId, student);
				}
			}
		}
	}

	for (const call of callMap.values()) {
		const current = tools.get(call.toolName) ?? {
			toolName: call.toolName,
			toolDisplayName: call.toolDisplayName,
			totalCalls: 0,
			completedCalls: 0,
			failedCalls: 0,
			pendingCalls: 0,
			totalDurationMs: 0,
			durationSamples: 0,
			studentIds: new Set<string>()
		};
		current.totalCalls++;
		current.studentIds.add(call.studentId);
		if (call.failed) {
			current.failedCalls++;
		} else if (call.status === 'completed') {
			current.completedCalls++;
		} else {
			current.pendingCalls++;
		}
		if (typeof call.durationMs === 'number') {
			current.totalDurationMs += call.durationMs;
			current.durationSamples++;
		}
		tools.set(call.toolName, current);

		const student = studentUsage.get(call.studentId) ?? {
			student: transcripts.find((session) => session.student.userId === call.studentId)?.student ?? {
				userId: call.studentId,
				username: call.studentId,
				email: '',
				alias: undefined
			},
			toolCalls: 0,
			failedToolCalls: 0,
			uiResponses: 0,
			distinctTools: new Set<string>()
		};
		student.toolCalls++;
		if (call.failed) student.failedToolCalls++;
		student.distinctTools.add(call.toolName);
		studentUsage.set(call.studentId, student);
	}

	const toolSummaries = [...tools.values()]
		.sort((a, b) => b.totalCalls - a.totalCalls || a.toolDisplayName.localeCompare(b.toolDisplayName))
		.slice(0, limit)
		.map((tool) => ({
			toolName: tool.toolName,
			toolDisplayName: tool.toolDisplayName,
			totalCalls: tool.totalCalls,
			completedCalls: tool.completedCalls,
			failedCalls: tool.failedCalls,
			pendingCalls: tool.pendingCalls,
			uniqueStudents: tool.studentIds.size,
			averageDurationMs:
				tool.durationSamples > 0 ? Math.round(tool.totalDurationMs / tool.durationSamples) : null
		}));

	const componentSummaries = [...components.values()]
		.sort((a, b) => b.renderCount - a.renderCount || a.componentKey.localeCompare(b.componentKey))
		.slice(0, limit)
		.map((component) => ({
			componentKey: component.componentKey,
			renderCount: component.renderCount,
			responseCount: component.responseCount,
			uniqueStudents: component.studentIds.size,
			averageScore:
				component.scoreSamples > 0 ? Math.round(component.totalScore / component.scoreSamples) : null
		}));

	const studentSummaries = [...studentUsage.values()]
		.sort((a, b) => b.toolCalls - a.toolCalls || a.student.username.localeCompare(b.student.username))
		.slice(0, limit)
		.map((entry) => ({
			student: entry.student,
			toolCalls: entry.toolCalls,
			failedToolCalls: entry.failedToolCalls,
			uiResponses: entry.uiResponses,
			distinctTools: entry.distinctTools.size
		}));

	return {
		totalToolCalls: [...tools.values()].reduce((sum, tool) => sum + tool.totalCalls, 0),
		totalToolFailures: [...tools.values()].reduce((sum, tool) => sum + tool.failedCalls, 0),
		totalUIComponentsRendered: [...components.values()].reduce(
			(sum, component) => sum + component.renderCount,
			0
		),
		totalUIResponses: [...components.values()].reduce(
			(sum, component) => sum + component.responseCount,
			0
		),
		tools: toolSummaries,
		components: componentSummaries,
		students: studentSummaries
	};
}

function evaluateStuckSessions(
	students: StudentActivityRecord[],
	options?: { minScore?: number; maxResults?: number; minLearnerMessages?: number }
) {
	const minScore = options?.minScore ?? STUCK_MIN_SCORE;
	const maxResults = options?.maxResults ?? STUCK_MAX_RESULTS;
	const minLearnerMessages = options?.minLearnerMessages ?? 3;

	const flaggedSessions = students
		.flatMap((student) =>
			student.sessions.map((session) => {
				const repeatedLearnerTurns = extractRepeatedLearnerTurns(session.messages);
				let toolFailureCount = 0;
				let unresolvedTurnCount = 0;

				for (const message of session.messages) {
					if (message.role === 'user') unresolvedTurnCount++;
					if (message.role === 'assistant') unresolvedTurnCount = 0;

					for (const part of message.parts) {
						if (
							part.kind === 'tool-result' &&
							(part.status === 'failed' || Boolean(part.errorMessage))
						) {
							toolFailureCount++;
						}
					}
				}

				const reasons: string[] = [];
				let score = 0;

				if (session.learnerMessageCount >= minLearnerMessages) {
					score += 10;
					reasons.push(`Sesion larga con ${session.learnerMessageCount} intervenciones del estudiante.`);
				}

				if (session.learnerMessageCount >= minLearnerMessages + 3) {
					score += 10;
				}

				if (repeatedLearnerTurns > 0) {
					score += 20;
					reasons.push(`Hay ${repeatedLearnerTurns} reformulaciones o repeticiones del estudiante.`);
				}

				if (toolFailureCount > 0) {
					score += 25;
					reasons.push(`Se detectaron ${toolFailureCount} fallos de herramienta.`);
				}

				if (session.toolCallCount >= 3) {
					score += 10;
					reasons.push(`La sesion dependio de ${session.toolCallCount} llamadas a herramientas.`);
				}

				if ((session.messages.at(-1)?.role ?? 'assistant') !== 'assistant') {
					score += 10;
					reasons.push('La sesion termina sin una respuesta final clara del asistente.');
				}

				if (student.metrics.status !== 'completed') {
					score += 15;
					reasons.push(`El estado de progreso sigue en "${student.metrics.status}".`);
				}

				if (unresolvedTurnCount >= 2) {
					score += 10;
					reasons.push('Hay varios turnos del estudiante sin resolucion posterior visible.');
				}

				const finalScore = clamp(score, 0, 100);
				return {
					chatId: session.chatId,
					student: session.student,
					sessionStartedAt: session.sessionStartedAt,
					sessionUpdatedAt: session.sessionUpdatedAt,
					progressStatus: student.metrics.status,
					stuckScore: finalScore,
					severity: finalScore >= 70 ? 'high' : finalScore >= 50 ? 'medium' : 'low',
					learnerMessageCount: session.learnerMessageCount,
					toolCallCount: session.toolCallCount,
					uiResponseCount: session.uiResponseCount,
					repeatedLearnerTurns,
					toolFailureCount,
					reasons,
					excerpt: buildSessionExcerpt(session)
				};
			})
		)
		.filter((session) => session.stuckScore >= minScore)
		.sort(
			(a, b) =>
				b.stuckScore - a.stuckScore ||
				new Date(b.sessionUpdatedAt).getTime() - new Date(a.sessionUpdatedAt).getTime()
		);

	const sessions = flaggedSessions
		.slice(0, maxResults);

	return {
		totalFlaggedSessions: flaggedSessions.length,
		sessions
	};
}

function buildGroupStats(records: StudentActivityRecord[]) {
	const statuses = {
		completed: records.filter((record) => record.metrics.status === 'completed').length,
		inProgress: records.filter((record) => record.metrics.status === 'in_progress').length,
		abandoned: records.filter((record) => record.metrics.status === 'abandoned').length,
		notStarted: records.filter((record) => record.metrics.status === 'not_started').length
	};

	return {
		studentCount: records.length,
		activeStudents: records.filter((record) => record.metrics.sessionCount > 0).length,
		completionRate: records.length > 0 ? Math.round((statuses.completed / records.length) * 100) : 0,
		statuses,
		averageSessionsPerStudent: average(records.map((record) => record.metrics.sessionCount)),
		averageLearnerMessages: average(records.map((record) => record.metrics.learnerMessageCount)),
		averageToolCalls: average(records.map((record) => record.metrics.toolCallCount)),
		averageUIResponses: average(records.map((record) => record.metrics.uiResponseCount)),
		averageAttemptsCount: average(records.map((record) => record.metrics.attemptsCount)),
		averageTimeSpentSeconds: average(records.map((record) => record.metrics.timeSpentSeconds)),
		averageLearnerMessageLength: average(
			records.map((record) => record.metrics.averageLearnerMessageLength)
		),
		averageEngagementScore: average(records.map((record) => record.metrics.engagementScore)),
		riskDistribution: {
			high: records.filter((record) => record.metrics.riskLevel === 'high').length,
			medium: records.filter((record) => record.metrics.riskLevel === 'medium').length,
			low: records.filter((record) => record.metrics.riskLevel === 'low').length
		},
		lastActivityAt: getLatestIso(records.map((record) => record.metrics.lastActivityAt))
	};
}

async function loadActivityData(
	access: LearningEvidenceAccessContext,
	query: ActivityAnalyticsQuery
): Promise<LoadedActivityData> {
	const activity = await LearningEvidenceService.getActivityContext(access, query.activityId);
	const transcripts = await LearningEvidenceService.getActivityTranscripts(access, {
		activityId: query.activityId,
		studentIds: query.studentIds,
		chatIds: query.chatIds,
		dateFrom: query.dateFrom,
		dateTo: query.dateTo,
		search: query.search
	});

	const roster =
		activity.courseId !== null
			? await LearningEvidenceService.getCourseStudentRoster(access, activity.courseId, query.studentIds)
			: [];

	const progressConditions = [eq(schema.learningActivityProgress.activityId, query.activityId)];
	if (activity.courseId) {
		progressConditions.push(eq(schema.learningActivityProgress.courseId, activity.courseId));
	}
	const studentIds = normalizeIdList(query.studentIds);
	if (studentIds.length > 0) {
		progressConditions.push(inArray(schema.learningActivityProgress.userId, studentIds));
	}

	const progressRows =
		activity.courseId !== null
			? await db
					.select()
					.from(schema.learningActivityProgress)
					.where(and(...progressConditions))
			: [];

	const studentRefMap = new Map<string, LearningEvidenceStudentRef>();
	for (const student of roster) {
		studentRefMap.set(student.userId, student);
	}
	for (const transcript of transcripts) {
		studentRefMap.set(transcript.student.userId, transcript.student);
	}

	const sessionsByStudent = new Map<string, LearningEvidenceTranscriptSession[]>();
	for (const transcript of transcripts) {
		const current = sessionsByStudent.get(transcript.student.userId) ?? [];
		current.push(transcript);
		sessionsByStudent.set(transcript.student.userId, current);
	}

	const progressByStudent = new Map(progressRows.map((row) => [row.userId, row]));
	const allStudentIds = [...new Set([...studentRefMap.keys(), ...progressByStudent.keys()])];

	const students = sortStudentsByName(
		allStudentIds.map((studentId) => {
			const student =
				studentRefMap.get(studentId) ?? {
					userId: studentId,
					username: studentId,
					email: '',
					alias: undefined
				};
			const sessions = sessionsByStudent.get(studentId) ?? [];
			const progress = progressByStudent.get(studentId) ?? null;
			const learnerMessages = sessions.flatMap((session) =>
				session.messages.filter((message) => message.role === 'user')
			);
			const averageLearnerMessageLength =
				learnerMessages.length > 0
					? Math.round(
							learnerMessages.reduce((sum, message) => sum + message.displayText.length, 0) /
								learnerMessages.length
						)
					: 0;
			const firstActivityAt = getEarliestIso([
				...sessions.map((session) => session.sessionStartedAt),
				toIso(progress?.startedAt)
			]);
			const lastActivityAt = getLatestIso([
				...sessions.map((session) => session.sessionUpdatedAt),
				toIso(progress?.lastInteractionAt),
				toIso(progress?.completedAt)
			]);
			const status =
				progress?.status ??
				(sessions.length > 0 ? schema.learningActivityStatus.IN_PROGRESS : 'not_started');
			const sessionCount = sessions.length;
			const totalMessages = sessions.reduce((sum, session) => sum + session.messageCount, 0);
			const learnerMessageCount = sessions.reduce(
				(sum, session) => sum + session.learnerMessageCount,
				0
			);
			const assistantMessageCount = sessions.reduce(
				(sum, session) => sum + session.assistantMessageCount,
				0
			);
			const toolCallCount = sessions.reduce((sum, session) => sum + session.toolCallCount, 0);
			const uiResponseCount = sessions.reduce((sum, session) => sum + session.uiResponseCount, 0);
			const attemptsCount = progress?.attemptsCount ?? sessionCount;
			const timeSpentSeconds = progress?.timeSpentSeconds ?? 0;
			const engagementScore = computeEngagementScore({
				sessionCount,
				learnerMessageCount,
				averageLearnerMessageLength,
				lastActivityAt
			});

			return {
				student,
				sessions,
				progress,
				metrics: {
					status,
					sessionCount,
					totalMessages,
					learnerMessageCount,
					assistantMessageCount,
					toolCallCount,
					uiResponseCount,
					averageLearnerMessageLength,
					attemptsCount,
					timeSpentSeconds,
					firstActivityAt,
					lastActivityAt,
					engagementScore,
					riskLevel: computeRiskLevel(engagementScore, status)
				}
			};
		})
	);

	return {
		activity,
		roster,
		transcripts,
		progressRows,
		students
	};
}

export class ActivityAnalyticsService {
	static async getLearningProgressTimeline(
		access: LearningEvidenceAccessContext,
		query: ActivityAnalyticsQuery & {
			bucket?: TimelineBucket;
			limit?: number;
			includeStudentDetails?: boolean;
		}
	) {
		const data = await loadActivityData(access, query);
		const bucket = query.bucket ?? 'day';
		const limit = query.limit ?? DEFAULT_TIMELINE_LIMIT;
		const timeline = new Map<
			string,
			{
				bucketStart: string;
				sessionCount: number;
				learnerMessages: number;
				assistantMessages: number;
				toolCalls: number;
				uiResponses: number;
				activeStudentIds: Set<string>;
				startedStudentIds: Set<string>;
				completedStudentIds: Set<string>;
			}
		>();

		for (const session of data.transcripts) {
			const key = toBucketStart(session.sessionStartedAt, bucket);
			const current = timeline.get(key) ?? {
				bucketStart: key,
				sessionCount: 0,
				learnerMessages: 0,
				assistantMessages: 0,
				toolCalls: 0,
				uiResponses: 0,
				activeStudentIds: new Set<string>(),
				startedStudentIds: new Set<string>(),
				completedStudentIds: new Set<string>()
			};
			current.sessionCount++;
			current.learnerMessages += session.learnerMessageCount;
			current.assistantMessages += session.assistantMessageCount;
			current.toolCalls += session.toolCallCount;
			current.uiResponses += session.uiResponseCount;
			current.activeStudentIds.add(session.student.userId);
			timeline.set(key, current);
		}

		for (const progress of data.progressRows) {
			const startedAt = toIso(progress.startedAt);
			if (startedAt) {
				const key = toBucketStart(startedAt, bucket);
				const current = timeline.get(key) ?? {
					bucketStart: key,
					sessionCount: 0,
					learnerMessages: 0,
					assistantMessages: 0,
					toolCalls: 0,
					uiResponses: 0,
					activeStudentIds: new Set<string>(),
					startedStudentIds: new Set<string>(),
					completedStudentIds: new Set<string>()
				};
				current.startedStudentIds.add(progress.userId);
				timeline.set(key, current);
			}

			const completedAt = toIso(progress.completedAt);
			if (completedAt) {
				const key = toBucketStart(completedAt, bucket);
				const current = timeline.get(key) ?? {
					bucketStart: key,
					sessionCount: 0,
					learnerMessages: 0,
					assistantMessages: 0,
					toolCalls: 0,
					uiResponses: 0,
					activeStudentIds: new Set<string>(),
					startedStudentIds: new Set<string>(),
					completedStudentIds: new Set<string>()
				};
				current.completedStudentIds.add(progress.userId);
				timeline.set(key, current);
			}
		}

		const points = [...timeline.values()]
			.sort((a, b) => new Date(a.bucketStart).getTime() - new Date(b.bucketStart).getTime())
			.slice(-limit)
			.map((point) => ({
				bucketStart: point.bucketStart,
				activeStudents: point.activeStudentIds.size,
				startedStudents: point.startedStudentIds.size,
				completedStudents: point.completedStudentIds.size,
				sessionCount: point.sessionCount,
				learnerMessages: point.learnerMessages,
				assistantMessages: point.assistantMessages,
				toolCalls: point.toolCalls,
				uiResponses: point.uiResponses
			}));

		const statuses = {
			completed: data.students.filter((student) => student.metrics.status === 'completed').length,
			inProgress: data.students.filter((student) => student.metrics.status === 'in_progress').length,
			abandoned: data.students.filter((student) => student.metrics.status === 'abandoned').length,
			notStarted: data.students.filter((student) => student.metrics.status === 'not_started').length
		};

		return {
			activityId: query.activityId,
			activityName: data.activity.name,
			bucket,
			totalStudents: data.students.length,
			statuses,
			points,
			students: query.includeStudentDetails
				? data.students.map((student) => ({
						student: student.student,
						...student.metrics
					}))
				: undefined
		};
	}

	static async getActivityToolUsageSummary(
		access: LearningEvidenceAccessContext,
		query: ActivityAnalyticsQuery & { limit?: number }
	) {
		const data = await loadActivityData(access, query);
		return {
			activityId: query.activityId,
			activityName: data.activity.name,
			...collectToolUsage(data.transcripts, query.limit ?? TOOL_USAGE_LIMIT)
		};
	}

	static async compareStudentGroups(
		access: LearningEvidenceAccessContext,
		query: Omit<ActivityAnalyticsQuery, 'studentIds'> & {
			groupAStudentIds?: string[];
			groupBStudentIds?: string[];
			studentIds?: string[];
			labelA?: string;
			labelB?: string;
		}
	) {
		const data = await loadActivityData(access, {
			activityId: query.activityId,
			chatIds: query.chatIds,
			dateFrom: query.dateFrom,
			dateTo: query.dateTo,
			search: query.search
		});

		const groupAIds = normalizeIdList(query.groupAStudentIds?.length ? query.groupAStudentIds : query.studentIds);
		if (groupAIds.length === 0) {
			throw new Error('La comparacion requiere al menos un grupo A de estudiantes.');
		}

		const allStudentIds = data.students.map((student) => student.student.userId);
		const groupASet = new Set(groupAIds);
		const explicitGroupBIds = normalizeIdList(query.groupBStudentIds);
		const groupBIds =
			explicitGroupBIds.length > 0
				? explicitGroupBIds
				: allStudentIds.filter((studentId) => !groupASet.has(studentId));

		if (groupBIds.length === 0) {
			throw new Error('No hay suficientes estudiantes para construir el grupo B.');
		}

		const groupA = data.students.filter((student) => groupASet.has(student.student.userId));
		const groupBSet = new Set(groupBIds);
		const groupB = data.students.filter((student) => groupBSet.has(student.student.userId));

		const statsA = buildGroupStats(groupA);
		const statsB = buildGroupStats(groupB);

		return {
			activityId: query.activityId,
			activityName: data.activity.name,
			groupA: {
				label: query.labelA?.trim() || 'Grupo A',
				studentIds: groupA.map((student) => student.student.userId),
				stats: statsA
			},
			groupB: {
				label: query.labelB?.trim() || (explicitGroupBIds.length > 0 ? 'Grupo B' : 'Resto del curso'),
				studentIds: groupB.map((student) => student.student.userId),
				stats: statsB
			},
			deltas: {
				completionRate: statsA.completionRate - statsB.completionRate,
				averageEngagementScore: statsA.averageEngagementScore - statsB.averageEngagementScore,
				averageSessionsPerStudent:
					statsA.averageSessionsPerStudent - statsB.averageSessionsPerStudent,
				averageLearnerMessages: statsA.averageLearnerMessages - statsB.averageLearnerMessages,
				averageToolCalls: statsA.averageToolCalls - statsB.averageToolCalls,
				averageAttemptsCount: statsA.averageAttemptsCount - statsB.averageAttemptsCount,
				averageTimeSpentSeconds:
					statsA.averageTimeSpentSeconds - statsB.averageTimeSpentSeconds
			}
		};
	}

	static async findStuckSessions(
		access: LearningEvidenceAccessContext,
		query: ActivityAnalyticsQuery & {
			maxResults?: number;
			minScore?: number;
			minLearnerMessages?: number;
		}
	) {
		const data = await loadActivityData(access, query);
		return {
			activityId: query.activityId,
			activityName: data.activity.name,
			...evaluateStuckSessions(data.students, {
				maxResults: query.maxResults,
				minScore: query.minScore,
				minLearnerMessages: query.minLearnerMessages
			})
		};
	}

	static async analyzeActivityDifficulty(
		access: LearningEvidenceAccessContext,
		query: ActivityAnalyticsQuery & { maxSignals?: number }
	) {
		const data = await loadActivityData(access, query);
		const toolUsage = collectToolUsage(data.transcripts, 5);
		const stuckSessions = evaluateStuckSessions(data.students, { maxResults: 5 });
		const statuses = {
			completed: data.students.filter((student) => student.metrics.status === 'completed').length,
			inProgress: data.students.filter((student) => student.metrics.status === 'in_progress').length,
			abandoned: data.students.filter((student) => student.metrics.status === 'abandoned').length,
			notStarted: data.students.filter((student) => student.metrics.status === 'not_started').length
		};
		const startedStudents = data.students.length - statuses.notStarted;
		const completionRate =
			data.students.length > 0 ? Math.round((statuses.completed / data.students.length) * 100) : 0;
		const maxSignals = query.maxSignals ?? 6;
		const difficultySignals: Array<{
			type: string;
			severity: RiskLevel;
			title: string;
			details: string;
		}> = [];

		if (startedStudents > 0 && completionRate < 50) {
			difficultySignals.push({
				type: 'low_completion',
				severity: completionRate < 30 ? 'high' : 'medium',
				title: 'Baja finalizacion',
				details: `Solo ${statuses.completed} de ${data.students.length} estudiantes han completado la actividad.`
			});
		}

		if (startedStudents > 0 && statuses.inProgress >= Math.max(2, Math.round(startedStudents * 0.4))) {
			difficultySignals.push({
				type: 'high_in_progress',
				severity: 'medium',
				title: 'Muchos estudiantes se quedan a mitad',
				details: `${statuses.inProgress} estudiantes siguen en progreso frente a ${statuses.completed} completados.`
			});
		}

		const averageAttempts = average(data.students.map((student) => student.metrics.attemptsCount));
		if (averageAttempts >= 2) {
			difficultySignals.push({
				type: 'repeated_attempts',
				severity: averageAttempts >= 3 ? 'high' : 'medium',
				title: 'Hay reintentos frecuentes',
				details: `La media de intentos por estudiante es ${averageAttempts}.`
			});
		}

		if (toolUsage.totalToolFailures > 0) {
			const topFailingTool = toolUsage.tools.find((tool) => tool.failedCalls > 0);
			difficultySignals.push({
				type: 'tool_failures',
				severity: toolUsage.totalToolFailures >= 5 ? 'high' : 'medium',
				title: 'Las herramientas introducen friccion',
				details: topFailingTool
					? `${toolUsage.totalToolFailures} fallos detectados; la herramienta mas afectada es ${topFailingTool.toolDisplayName}.`
					: `${toolUsage.totalToolFailures} fallos detectados en llamadas a herramientas.`
			});
		}

		if (stuckSessions.totalFlaggedSessions > 0) {
			difficultySignals.push({
				type: 'stuck_sessions',
				severity: stuckSessions.totalFlaggedSessions >= 4 ? 'high' : 'medium',
				title: 'Se detectan sesiones atascadas',
				details: `Hay ${stuckSessions.totalFlaggedSessions} sesiones con senales de atasco o resolucion incompleta.`
			});
		}

		if (data.students.length > 0 && statuses.notStarted >= Math.max(2, Math.round(data.students.length * 0.3))) {
			difficultySignals.push({
				type: 'inactive_students',
				severity: 'medium',
				title: 'Muchos estudiantes no arrancan',
				details: `${statuses.notStarted} estudiantes matriculados no muestran progreso ni evidencia.`
			});
		}

		return {
			activityId: query.activityId,
			activityName: data.activity.name,
			summary: {
				totalStudents: data.students.length,
				startedStudents,
				completionRate,
				statuses,
				totalSessions: data.transcripts.length,
				averageAttemptsCount: averageAttempts,
				averageTimeSpentSeconds: average(
					data.students.map((student) => student.metrics.timeSpentSeconds)
				),
				averageLearnerMessages: average(
					data.students.map((student) => student.metrics.learnerMessageCount)
				),
				averageEngagementScore: average(
					data.students.map((student) => student.metrics.engagementScore)
				)
			},
			difficultySignals: difficultySignals.slice(0, maxSignals),
			frequentLearnerTerms: extractTopTerms(data.transcripts, 8),
			stuckSessions: stuckSessions.sessions
		};
	}
}
