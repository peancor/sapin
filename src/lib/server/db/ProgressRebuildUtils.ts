import { and, eq, inArray } from 'drizzle-orm';
import { db } from './index';
import {
    chat,
    courseRole,
    courseRoleType,
    courseInteractiveLearning,
    userInteractiveLearningChat,
    message,
    learningActivityProgress,
    learningProgressEvent,
    courseProgressSummary
} from './schema';
import {
    buildLearningProgressEventPayload,
    mergeActivityProgressMetadata,
    mergeCourseProgressSummaryMetadata
} from './ProgressMetadataUtils';
import { calculateCourseProgressSummary } from './ProgressUtils';

export const rebuildProgressMode = {
    FILL_MISSING: 'fill_missing',
    REBUILD_ALL: 'rebuild_all'
} as const;

export type RebuildProgressMode = (typeof rebuildProgressMode)[keyof typeof rebuildProgressMode];

interface RebuildCourseProgressInput {
    courseId: string;
    mode: RebuildProgressMode;
    requestedBy?: string;
}

interface ChatEvidence {
    userId: string;
    activityId: string;
    chatIds: Set<string>;
    firstAt: Date;
    lastAt: Date;
}

interface RebuildCourseProgressResult {
    mode: RebuildProgressMode;
    courseId: string;
    studentsTotal: number;
    activitiesTotal: number;
    evidencePairs: number;
    createdProgressRows: number;
    createdEventRows: number;
    skippedExistingRows: number;
    createdSummaryRows: number;
    updatedSummaryRows: number;
}

const MAX_REBUILD_INTERACTION_GAP_SECONDS = 15 * 60;

function estimateElapsedSeconds(startedAt: Date, lastInteractionAt: Date, completedAt: Date | null): number {
    const endAt = completedAt ?? lastInteractionAt;
    return Math.max(0, Math.floor((endAt.getTime() - startedAt.getTime()) / 1000));
}

function estimateChatDurationFromMessageTimestamps(timestamps: Date[]): number {
    if (timestamps.length <= 1) {
        return 0;
    }

    let total = 0;
    for (let index = 1; index < timestamps.length; index += 1) {
        const deltaSeconds = Math.max(
            0,
            Math.floor((timestamps[index].getTime() - timestamps[index - 1].getTime()) / 1000)
        );
        total += Math.min(deltaSeconds, MAX_REBUILD_INTERACTION_GAP_SECONDS);
    }

    return total;
}

function buildEvidenceKey(userId: string, activityId: string): string {
    return `${userId}::${activityId}`;
}

export async function rebuildCourseProgress(
    input: RebuildCourseProgressInput
): Promise<RebuildCourseProgressResult> {
    const { courseId, mode, requestedBy } = input;
    const now = new Date();
    const rebuildAt = now.toISOString();
    const correlationId = `rebuild:${courseId}:${now.getTime()}`;

    const students = await db
        .select({ userId: courseRole.userId })
        .from(courseRole)
        .where(
            and(
                eq(courseRole.courseId, courseId),
                eq(courseRole.role, courseRoleType.STUDENT),
                eq(courseRole.isActive, true)
            )
        );
    const studentIds = [...new Set(students.map((student) => student.userId))];

    const activities = await db
        .select({ activityId: courseInteractiveLearning.interactiveLearningId })
        .from(courseInteractiveLearning)
        .where(eq(courseInteractiveLearning.courseId, courseId));
    const activityIds = [...new Set(activities.map((activity) => activity.activityId))];

    if (mode === rebuildProgressMode.REBUILD_ALL) {
        await db.delete(learningProgressEvent).where(eq(learningProgressEvent.courseId, courseId));
        await db
            .delete(learningActivityProgress)
            .where(eq(learningActivityProgress.courseId, courseId));
        await db.delete(courseProgressSummary).where(eq(courseProgressSummary.courseId, courseId));
    }

    if (studentIds.length === 0 || activityIds.length === 0) {
        return {
            mode,
            courseId,
            studentsTotal: studentIds.length,
            activitiesTotal: activityIds.length,
            evidencePairs: 0,
            createdProgressRows: 0,
            createdEventRows: 0,
            skippedExistingRows: 0,
            createdSummaryRows: 0,
            updatedSummaryRows: 0
        };
    }

    const chatLinks = await db
        .select({
            userId: userInteractiveLearningChat.userId,
            activityId: userInteractiveLearningChat.interactiveLearningChatId,
            chatId: userInteractiveLearningChat.chatId,
            chatCreatedAt: chat.createdAt,
            chatUpdatedAt: chat.updatedAt
        })
        .from(userInteractiveLearningChat)
        .innerJoin(chat, eq(chat.id, userInteractiveLearningChat.chatId))
        .where(
            and(
                inArray(userInteractiveLearningChat.userId, studentIds),
                inArray(userInteractiveLearningChat.interactiveLearningChatId, activityIds)
            )
        );

    const chatIds = [...new Set(chatLinks.map((link) => link.chatId))];
    const doneChatIds = new Set<string>();
    const chatDurationById = new Map<string, number>();

    if (chatIds.length > 0) {
        const assistantMessages = await db
            .select({ chatId: message.chatId, content: message.content })
            .from(message)
            .where(and(inArray(message.chatId, chatIds), eq(message.type, 'ASSISTANT')));

        for (const assistantMessage of assistantMessages) {
            if (assistantMessage.content.includes('[[DONE]]')) {
                doneChatIds.add(assistantMessage.chatId);
            }
        }

        const chatMessages = await db
            .select({ chatId: message.chatId, createdAt: message.createdAt })
            .from(message)
            .where(inArray(message.chatId, chatIds));

        const timestampsByChat = new Map<string, Date[]>();
        for (const chatMessage of chatMessages) {
            const existing = timestampsByChat.get(chatMessage.chatId);
            if (existing) {
                existing.push(chatMessage.createdAt);
                continue;
            }
            timestampsByChat.set(chatMessage.chatId, [chatMessage.createdAt]);
        }

        for (const [chatId, timestamps] of timestampsByChat.entries()) {
            timestamps.sort((a, b) => a.getTime() - b.getTime());
            chatDurationById.set(chatId, estimateChatDurationFromMessageTimestamps(timestamps));
        }
    }

    const evidenceMap = new Map<string, ChatEvidence>();
    for (const link of chatLinks) {
        const evidenceKey = buildEvidenceKey(link.userId, link.activityId);
        const existingEvidence = evidenceMap.get(evidenceKey);

        if (!existingEvidence) {
            evidenceMap.set(evidenceKey, {
                userId: link.userId,
                activityId: link.activityId,
                chatIds: new Set([link.chatId]),
                firstAt: link.chatCreatedAt,
                lastAt: link.chatUpdatedAt
            });
            continue;
        }

        existingEvidence.chatIds.add(link.chatId);
        if (link.chatCreatedAt < existingEvidence.firstAt) {
            existingEvidence.firstAt = link.chatCreatedAt;
        }
        if (link.chatUpdatedAt > existingEvidence.lastAt) {
            existingEvidence.lastAt = link.chatUpdatedAt;
        }
    }

    const existingProgressRows = await db
        .select()
        .from(learningActivityProgress)
        .where(eq(learningActivityProgress.courseId, courseId));
    const existingProgressMap = new Map(
        existingProgressRows.map((row) => [buildEvidenceKey(row.userId, row.activityId), row])
    );

    let createdProgressRows = 0;
    let createdEventRows = 0;
    let skippedExistingRows = 0;

    for (const evidence of evidenceMap.values()) {
        const evidenceKey = buildEvidenceKey(evidence.userId, evidence.activityId);
        const existingProgress = existingProgressMap.get(evidenceKey);

        if (mode === rebuildProgressMode.FILL_MISSING && existingProgress) {
            skippedExistingRows += 1;
            continue;
        }

        const attemptsCount = Math.max(1, evidence.chatIds.size);
        const isCompleted = [...evidence.chatIds].some((chatId) => doneChatIds.has(chatId));
        const nextStatus = isCompleted ? 'completed' : 'in_progress';
        const completedAt = isCompleted ? evidence.lastAt : null;
        const estimatedFromMessages = [...evidence.chatIds].reduce(
            (acc, chatId) => acc + (chatDurationById.get(chatId) ?? 0),
            0
        );
        const estimatedFromEnvelope = estimateElapsedSeconds(
            evidence.firstAt,
            evidence.lastAt,
            completedAt
        );
        const estimatedTimeSpentSeconds =
            estimatedFromMessages > 0 ? estimatedFromMessages : estimatedFromEnvelope;

        await db.insert(learningActivityProgress).values({
            id: crypto.randomUUID(),
            userId: evidence.userId,
            courseId,
            activityId: evidence.activityId,
            activityType: 'chat',
            status: nextStatus,
            startedAt: evidence.firstAt,
            lastInteractionAt: evidence.lastAt,
            completedAt,
            attemptsCount,
            timeSpentSeconds: estimatedTimeSpentSeconds,
            metadataJson: mergeActivityProgressMetadata({
                existingMetadata: null,
                eventType: isCompleted ? 'COMPLETED' : 'INTERACTION',
                source: 'admin-rebuild',
                details: {
                    mode,
                    rebuildAt,
                    requestedBy,
                    attemptsCount,
                    evidenceChats: attemptsCount,
                    estimatedTimeSpentSeconds,
                    estimatedFromMessages,
                    estimatedFromEnvelope,
                    estimatedFrom: {
                        startedAt: evidence.firstAt.toISOString(),
                        lastInteractionAt: evidence.lastAt.toISOString(),
                        completedAt: completedAt?.toISOString() ?? null
                    }
                }
            }),
            createdAt: now,
            updatedAt: now
        });
        createdProgressRows += 1;

        await db.insert(learningProgressEvent).values({
            id: crypto.randomUUID(),
            userId: evidence.userId,
            courseId,
            activityId: evidence.activityId,
            eventType: 'reconstructed',
            eventAt: evidence.lastAt,
            source: 'admin-rebuild',
            payloadJson: buildLearningProgressEventPayload({
                source: 'admin-rebuild',
                status: nextStatus,
                details: {
                    mode,
                    rebuildAt,
                    requestedBy,
                    attemptsCount,
                    hasDoneMarker: isCompleted
                }
            }),
            correlationId,
            createdAt: now,
            updatedAt: now
        });
        createdEventRows += 1;
    }

    const finalProgressRows = await db
        .select()
        .from(learningActivityProgress)
        .where(eq(learningActivityProgress.courseId, courseId));

    const rowsByUser = new Map<string, typeof finalProgressRows>();
    for (const progressRow of finalProgressRows) {
        const list = rowsByUser.get(progressRow.userId);
        if (!list) {
            rowsByUser.set(progressRow.userId, [progressRow]);
            continue;
        }
        list.push(progressRow);
    }

    const existingSummaries = await db
        .select()
        .from(courseProgressSummary)
        .where(eq(courseProgressSummary.courseId, courseId));
    const existingSummaryMap = new Map(existingSummaries.map((row) => [row.userId, row]));

    let createdSummaryRows = 0;
    let updatedSummaryRows = 0;

    for (const userId of studentIds) {
        const userRows = rowsByUser.get(userId) ?? [];
        const summary = calculateCourseProgressSummary(userRows, activityIds.length, {
            context: `admin-rebuild:course:${courseId}:user:${userId}`
        });
        const inProgressActivities = userRows.filter((row) => row.status === 'in_progress').length;
        const existingSummary = existingSummaryMap.get(userId);

        if (existingSummary) {
            await db
                .update(courseProgressSummary)
                .set({
                    completedActivities: summary.completedActivities,
                    inProgressActivities,
                    completionRate: summary.completionRate,
                    totalTimeSpentSeconds: summary.totalTimeSpent,
                    lastActivityAt: summary.lastActivityAt,
                    metadataJson: mergeCourseProgressSummaryMetadata({
                        existingMetadata: existingSummary.metadataJson,
                        source: 'admin-rebuild',
                        totalActivities: activityIds.length,
                        completedFromStatusCount: summary.completedActivities,
                        inProgressFromStatusCount: inProgressActivities,
                        patch: {
                            custom: {
                                mode,
                                rebuildAt,
                                requestedBy
                            }
                        }
                    }),
                    updatedAt: now
                })
                .where(eq(courseProgressSummary.id, existingSummary.id));
            updatedSummaryRows += 1;
        } else {
            await db.insert(courseProgressSummary).values({
                id: crypto.randomUUID(),
                userId,
                courseId,
                completedActivities: summary.completedActivities,
                inProgressActivities,
                completionRate: summary.completionRate,
                totalTimeSpentSeconds: summary.totalTimeSpent,
                lastActivityAt: summary.lastActivityAt,
                metadataJson: mergeCourseProgressSummaryMetadata({
                    existingMetadata: null,
                    source: 'admin-rebuild',
                    totalActivities: activityIds.length,
                    completedFromStatusCount: summary.completedActivities,
                    inProgressFromStatusCount: inProgressActivities,
                    patch: {
                        custom: {
                            mode,
                            rebuildAt,
                            requestedBy
                        }
                    }
                }),
                createdAt: now,
                updatedAt: now
            });
            createdSummaryRows += 1;
        }
    }

    return {
        mode,
        courseId,
        studentsTotal: studentIds.length,
        activitiesTotal: activityIds.length,
        evidencePairs: evidenceMap.size,
        createdProgressRows,
        createdEventRows,
        skippedExistingRows,
        createdSummaryRows,
        updatedSummaryRows
    };
}