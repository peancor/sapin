import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { ActivityAnalyticsService } from '$lib/server/learning-evidence/ActivityAnalyticsService';
import { AdvancedInsightsService } from '$lib/server/learning-evidence/AdvancedInsightsService';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import type { LearningEvidenceAccessContext } from '$lib/types/learningEvidence';

type Access = LearningEvidenceAccessContext;

function roundPercent(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

function getLatestIso(values: Array<string | null | undefined>): string | null {
	return values.reduce<string | null>((latest, value) => {
		if (!value) return latest;
		if (!latest) return value;
		return new Date(value) > new Date(latest) ? value : latest;
	}, null);
}

function buildDisplayName(student: { username: string; alias?: string }): string {
	return student.alias?.trim() || student.username;
}

export class StaffAgentAnalyticsService {
	static async getCoursePromptContext(access: Access, courseId: string) {
		const [courseRecord] = await db
			.select({
				id: schema.course.id,
				name: schema.course.name,
				description: schema.course.description
			})
			.from(schema.course)
			.where(eq(schema.course.id, courseId))
			.limit(1);

		const roster = await LearningEvidenceService.getCourseStudentRoster(access, courseId);
		const activities = await db
			.select({
				id: schema.interactiveLearning.id,
				name: schema.interactiveLearning.name,
				type: schema.interactiveLearning.type,
				status: schema.interactiveLearning.status,
				order: schema.courseInteractiveLearning.order
			})
			.from(schema.courseInteractiveLearning)
			.innerJoin(
				schema.interactiveLearning,
				eq(schema.courseInteractiveLearning.interactiveLearningId, schema.interactiveLearning.id)
			)
			.where(eq(schema.courseInteractiveLearning.courseId, courseId))
			.orderBy(schema.courseInteractiveLearning.order);

		return {
			courseId,
			courseName: courseRecord?.name ?? 'Curso',
			courseDescription: courseRecord?.description ?? null,
			totalStudents: roster.length,
			totalActivities: activities.length,
			activityCatalog: activities.map((activity) => ({
				id: activity.id,
				name: activity.name,
				type: activity.type,
				status: activity.status,
				order: activity.order
			}))
		};
	}

	static async getActivityPromptContext(access: Access, activityId: string) {
		const overview = await LearningEvidenceService.getActivityEvidenceOverview(access, activityId);

		return {
			activityId,
			courseId: overview.activity.courseId ?? null,
			activityName: overview.activity.name,
			activityDescription: overview.activity.description ?? null,
			activityType: overview.activity.activityType,
			totalEnrolledStudents: overview.totalEnrolledStudents,
			studentsWithEvidenceCount: overview.studentsWithEvidenceCount,
			totalSessions: overview.totalSessions,
			totalMessages: overview.totalMessages,
			lastActivityAt: overview.lastActivityAt
		};
	}

	static async getActivityParticipants(
		access: Access,
		params: {
			activityId: string;
			studentIds?: string[];
			dateFrom?: string;
			dateTo?: string;
		}
	) {
		const overview = await LearningEvidenceService.getActivityEvidenceOverview(
			access,
			params.activityId,
			params.studentIds
		);
		const transcripts = await LearningEvidenceService.getActivityTranscripts(access, {
			activityId: params.activityId,
			studentIds: params.studentIds,
			dateFrom: params.dateFrom,
			dateTo: params.dateTo
		});

		const transcriptByStudent = new Map<string, (typeof transcripts)[number][]>();
		for (const session of transcripts) {
			const bucket = transcriptByStudent.get(session.student.userId) ?? [];
			bucket.push(session);
			transcriptByStudent.set(session.student.userId, bucket);
		}

		const participants = overview.studentSummaries
			.filter((student) => transcriptByStudent.has(student.userId))
			.map((student) => {
				const sessions = transcriptByStudent.get(student.userId) ?? [];
				return {
					student: {
						userId: student.userId,
						username: student.username,
						email: student.email,
						alias: student.alias
					},
					displayName: buildDisplayName(student),
					sessionCount: sessions.length,
					totalMessages: sessions.reduce((sum, session) => sum + session.messageCount, 0),
					learnerMessages: sessions.reduce((sum, session) => sum + session.learnerMessageCount, 0),
					assistantMessages: sessions.reduce(
						(sum, session) => sum + session.assistantMessageCount,
						0
					),
					toolCalls: sessions.reduce((sum, session) => sum + session.toolCallCount, 0),
					lastActivityAt: getLatestIso(sessions.map((session) => session.sessionUpdatedAt)),
					progressStatus: student.progressStatus
				};
			})
			.sort((a, b) => b.sessionCount - a.sessionCount || a.displayName.localeCompare(b.displayName));

		const participantIds = new Set(participants.map((participant) => participant.student.userId));
		const nonParticipants = overview.studentSummaries
			.filter((student) => !participantIds.has(student.userId))
			.map((student) => ({
				student: {
					userId: student.userId,
					username: student.username,
					email: student.email,
					alias: student.alias
				},
				displayName: buildDisplayName(student),
				progressStatus: student.progressStatus,
				lastActivityAt: student.lastActivityAt
			}))
			.sort((a, b) => a.displayName.localeCompare(b.displayName));

		return {
			activityId: params.activityId,
			activityName: overview.activity.name,
			totalEnrolledStudents: overview.totalEnrolledStudents,
			participantsCount: participants.length,
			nonParticipantsCount: nonParticipants.length,
			participationRate:
				overview.totalEnrolledStudents > 0
					? roundPercent((participants.length / overview.totalEnrolledStudents) * 100)
					: 0,
			evidenceWindow: {
				dateFrom: params.dateFrom ?? null,
				dateTo: params.dateTo ?? null
			},
			participants,
			nonParticipants
		};
	}

	static async getCourseActivityOverview(
		access: Access,
		params: {
			courseId: string;
			activityIds?: string[];
		}
	) {
		const activities = await db
			.select({
				id: schema.interactiveLearning.id,
				name: schema.interactiveLearning.name,
				type: schema.interactiveLearning.type,
				status: schema.interactiveLearning.status,
				order: schema.courseInteractiveLearning.order
			})
			.from(schema.courseInteractiveLearning)
			.innerJoin(
				schema.interactiveLearning,
				eq(schema.courseInteractiveLearning.interactiveLearningId, schema.interactiveLearning.id)
			)
			.where(eq(schema.courseInteractiveLearning.courseId, params.courseId))
			.orderBy(schema.courseInteractiveLearning.order);

		const filteredActivities =
			params.activityIds && params.activityIds.length > 0
				? activities.filter((activity) => params.activityIds?.includes(activity.id))
				: activities;

		const summaries = await Promise.all(
			filteredActivities.map(async (activity) => {
				const overview = await LearningEvidenceService.getActivityEvidenceOverview(access, activity.id);
				const completionCount = overview.studentSummaries.filter(
					(student) => student.progressStatus === 'completed'
				).length;

				return {
					activityId: activity.id,
					activityName: activity.name,
					activityType: activity.type,
					status: activity.status,
					order: activity.order,
					totalEnrolledStudents: overview.totalEnrolledStudents,
					studentsWithEvidenceCount: overview.studentsWithEvidenceCount,
					totalSessions: overview.totalSessions,
					totalMessages: overview.totalMessages,
					completionCount,
					participationRate:
						overview.totalEnrolledStudents > 0
							? roundPercent(
									(overview.studentsWithEvidenceCount / overview.totalEnrolledStudents) * 100
								)
							: 0,
					completionRate:
						overview.totalEnrolledStudents > 0
							? roundPercent((completionCount / overview.totalEnrolledStudents) * 100)
							: 0,
					lastActivityAt: overview.lastActivityAt
				};
			})
		);

		return {
			courseId: params.courseId,
			totalActivities: summaries.length,
			activities: summaries,
			aggregate: {
				totalSessions: summaries.reduce((sum, item) => sum + item.totalSessions, 0),
				totalMessages: summaries.reduce((sum, item) => sum + item.totalMessages, 0),
				averageParticipationRate:
					summaries.length > 0
						? roundPercent(
								summaries.reduce((sum, item) => sum + item.participationRate, 0) / summaries.length
							)
						: 0,
				averageCompletionRate:
					summaries.length > 0
						? roundPercent(
								summaries.reduce((sum, item) => sum + item.completionRate, 0) / summaries.length
							)
						: 0,
				lastActivityAt: getLatestIso(summaries.map((item) => item.lastActivityAt))
			}
		};
	}

	static async getCourseStudentSignals(
		access: Access,
		params: {
			courseId: string;
			studentIds?: string[];
			limit?: number;
		}
	) {
		const roster = await LearningEvidenceService.getCourseStudentRoster(
			access,
			params.courseId,
			params.studentIds
		);
		const activityRows = await db
			.select({
				id: schema.interactiveLearning.id,
				name: schema.interactiveLearning.name,
				order: schema.courseInteractiveLearning.order
			})
			.from(schema.courseInteractiveLearning)
			.innerJoin(
				schema.interactiveLearning,
				eq(schema.courseInteractiveLearning.interactiveLearningId, schema.interactiveLearning.id)
			)
			.where(eq(schema.courseInteractiveLearning.courseId, params.courseId))
			.orderBy(schema.courseInteractiveLearning.order);

		const activitySummaries = await Promise.all(
			activityRows.map(async (activity) => {
				const overview = await LearningEvidenceService.getActivityEvidenceOverview(access, activity.id);
				return { activity, overview };
			})
		);

		const activityRiskSnapshots = await Promise.all(
			activityRows.map(async (activity) => ({
				activityId: activity.id,
				risk: await AdvancedInsightsService.forecastCompletionRisk(access, {
					activityId: activity.id,
					studentIds: params.studentIds,
					maxResults: 500,
					includeCompleted: true
				})
			}))
		);

		const riskByActivityAndStudent = new Map<string, Map<string, number>>();
		for (const snapshot of activityRiskSnapshots) {
			const bucket = new Map<string, number>();
			for (const student of snapshot.risk.students) {
				bucket.set(student.student.userId, student.riskScore);
			}
			riskByActivityAndStudent.set(snapshot.activityId, bucket);
		}

		const signals = roster.map((student) => {
			let completedActivities = 0;
			let startedActivities = 0;
			let sessionCount = 0;
			let totalMessages = 0;
			let learnerMessages = 0;
			const recentActivity: Array<string | null> = [];
			const riskScores: number[] = [];
			const activitySignals: Array<{
				activityId: string;
				activityName: string;
				progressStatus: string;
				sessionCount: number;
				riskScore: number | null;
			}> = [];

			for (const { activity, overview } of activitySummaries) {
				const summary = overview.studentSummaries.find((item) => item.userId === student.userId);
				if (!summary) continue;

				if (summary.progressStatus === 'completed') completedActivities++;
				if (summary.sessionCount > 0 || summary.progressStatus !== 'not_started') startedActivities++;
				sessionCount += summary.sessionCount;
				totalMessages += summary.totalMessages;
				learnerMessages += summary.learnerMessageCount;
				recentActivity.push(summary.lastActivityAt);

				const riskScore =
					riskByActivityAndStudent.get(activity.id)?.get(student.userId) ?? null;
				if (typeof riskScore === 'number') riskScores.push(riskScore);

				activitySignals.push({
					activityId: activity.id,
					activityName: activity.name,
					progressStatus: summary.progressStatus,
					sessionCount: summary.sessionCount,
					riskScore
				});
			}

			const totalActivities = activityRows.length;
			const notStartedActivities = Math.max(totalActivities - startedActivities, 0);
			const completionRate =
				totalActivities > 0 ? roundPercent((completedActivities / totalActivities) * 100) : 0;
			const participationRate =
				totalActivities > 0 ? roundPercent((startedActivities / totalActivities) * 100) : 0;
			const averageRisk =
				riskScores.length > 0
					? Math.round(riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length)
					: notStartedActivities > 0
						? 65
						: 0;
			const excellenceScore = Math.max(
				0,
				Math.min(100, Math.round(completionRate * 0.6 + participationRate * 0.25 + sessionCount * 2))
			);
			const attentionScore = Math.max(
				0,
				Math.min(
					100,
					Math.round(averageRisk * 0.65 + notStartedActivities * 8 + Math.max(0, 4 - sessionCount) * 5)
				)
			);

			const flags: string[] = [];
			if (completionRate >= 80) flags.push('alto_rendimiento');
			if (attentionScore >= 70) flags.push('requiere_seguimiento');
			if (notStartedActivities >= Math.max(2, Math.ceil(totalActivities / 3))) {
				flags.push('baja_participacion');
			}

			return {
				student,
				displayName: buildDisplayName(student),
				totalActivities,
				completedActivities,
				startedActivities,
				notStartedActivities,
				completionRate,
				participationRate,
				sessionCount,
				totalMessages,
				learnerMessages,
				lastActivityAt: getLatestIso(recentActivity),
				averageRisk,
				excellenceScore,
				attentionScore,
				flags,
				activitySignals
			};
		});

		const limit = params.limit ?? 8;

		return {
			courseId: params.courseId,
			totalStudents: signals.length,
			students: signals.sort(
				(a, b) => b.attentionScore - a.attentionScore || a.displayName.localeCompare(b.displayName)
			),
			topStudents: [...signals]
				.sort((a, b) => b.excellenceScore - a.excellenceScore || a.displayName.localeCompare(b.displayName))
				.slice(0, limit),
			attentionStudents: [...signals]
				.sort((a, b) => b.attentionScore - a.attentionScore || a.displayName.localeCompare(b.displayName))
				.slice(0, limit)
		};
	}
}

export default StaffAgentAnalyticsService;
