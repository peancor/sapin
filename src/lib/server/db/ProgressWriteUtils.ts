import { and, eq } from 'drizzle-orm';
import { db } from './index';
import {
    learningActivityProgress,
    learningProgressEvent,
    courseProgressSummary,
    courseInteractiveLearning
} from './schema';
import { calculateCourseProgressSummary } from './ProgressUtils';
import {
    buildLearningProgressEventPayload,
    mergeActivityProgressMetadata,
    mergeCourseProgressSummaryMetadata
} from './ProgressMetadataUtils';

interface ProgressWriteInput {
    userId: string;
    courseId: string;
    activityId: string;
    activityType?: string;
    source?: string;
}

const MAX_INTERACTION_GAP_SECONDS = 15 * 60;

async function syncCourseProgressSummary(
    userId: string,
    courseId: string,
    source: string
): Promise<void> {
    const [activityRecords, courseActivities, existingSummary] = await Promise.all([
        db
            .select()
            .from(learningActivityProgress)
            .where(
                and(
                    eq(learningActivityProgress.userId, userId),
                    eq(learningActivityProgress.courseId, courseId)
                )
            )
            .all(),
        db
            .select({ activityId: courseInteractiveLearning.interactiveLearningId })
            .from(courseInteractiveLearning)
            .where(eq(courseInteractiveLearning.courseId, courseId))
            .all(),
        db
            .select()
            .from(courseProgressSummary)
            .where(and(eq(courseProgressSummary.userId, userId), eq(courseProgressSummary.courseId, courseId)))
            .get()
    ]);

    const totalActivities = courseActivities.length;
    const progressSummary = calculateCourseProgressSummary(activityRecords, totalActivities, {
        context: `progress-write:${source}:course:${courseId}:user:${userId}`
    });
    const inProgressActivitiesCount = activityRecords.filter(
        (record) => record.status === 'in_progress'
    ).length;
    const now = new Date();

    if (existingSummary) {
        await db
            .update(courseProgressSummary)
            .set({
                completedActivities: progressSummary.completedActivities,
                inProgressActivities: inProgressActivitiesCount,
                completionRate: progressSummary.completionRate,
                totalTimeSpentSeconds: progressSummary.totalTimeSpent,
                lastActivityAt: progressSummary.lastActivityAt,
                metadataJson: mergeCourseProgressSummaryMetadata({
                    existingMetadata: existingSummary.metadataJson,
                    source,
                    totalActivities,
                    completedFromStatusCount: progressSummary.completedActivities,
                    inProgressFromStatusCount: inProgressActivitiesCount
                }),
                updatedAt: now
            })
            .where(eq(courseProgressSummary.id, existingSummary.id));

        return;
    }

    await db.insert(courseProgressSummary).values({
        id: crypto.randomUUID(),
        userId,
        courseId,
        completedActivities: progressSummary.completedActivities,
        inProgressActivities: inProgressActivitiesCount,
        completionRate: progressSummary.completionRate,
        totalTimeSpentSeconds: progressSummary.totalTimeSpent,
        lastActivityAt: progressSummary.lastActivityAt,
        metadataJson: mergeCourseProgressSummaryMetadata({
            existingMetadata: null,
            source,
            totalActivities,
            completedFromStatusCount: progressSummary.completedActivities,
            inProgressFromStatusCount: inProgressActivitiesCount
        }),
        createdAt: now,
        updatedAt: now
    });
}

export async function markActivityInProgress(input: ProgressWriteInput): Promise<void> {
    const now = new Date();

    const existing = await db
        .select()
        .from(learningActivityProgress)
        .where(
            and(
                eq(learningActivityProgress.userId, input.userId),
                eq(learningActivityProgress.courseId, input.courseId),
                eq(learningActivityProgress.activityId, input.activityId)
            )
        )
        .get();

    if (!existing) {
        await db.insert(learningActivityProgress).values({
            id: crypto.randomUUID(),
            userId: input.userId,
            courseId: input.courseId,
            activityId: input.activityId,
            activityType: input.activityType ?? 'chat',
            status: 'in_progress',
            startedAt: now,
            lastInteractionAt: now,
            attemptsCount: 1,
            timeSpentSeconds: 0,
            metadataJson: mergeActivityProgressMetadata({
                existingMetadata: null,
                eventType: 'STARTED',
                source: input.source ?? 'chat-api',
                details: { status: 'in_progress' }
            }),
            createdAt: now,
            updatedAt: now
        });

        await db.insert(learningProgressEvent).values({
            id: crypto.randomUUID(),
            userId: input.userId,
            courseId: input.courseId,
            activityId: input.activityId,
            eventType: 'started',
            eventAt: now,
            source: input.source ?? 'chat-api',
            payloadJson: buildLearningProgressEventPayload({
                source: input.source ?? 'chat-api',
                status: 'in_progress',
                details: {
                    status: 'in_progress',
                    mode: 'created'
                }
            }),
            correlationId: null,
            createdAt: now,
            updatedAt: now
        });

        await syncCourseProgressSummary(input.userId, input.courseId, input.source ?? 'chat-api');
        return;
    }

    const nextAttemptsCount = Math.max(1, existing.attemptsCount);
    const baselineInteractionAt = existing.lastInteractionAt ?? existing.startedAt ?? now;
    const rawElapsedSeconds = Math.max(
        0,
        Math.floor((now.getTime() - baselineInteractionAt.getTime()) / 1000)
    );
    const interactionDeltaSeconds = Math.min(rawElapsedSeconds, MAX_INTERACTION_GAP_SECONDS);
    const nextTimeSpentSeconds = Math.max(0, existing.timeSpentSeconds + interactionDeltaSeconds);

    await db
        .update(learningActivityProgress)
        .set({
            activityType: input.activityType ?? existing.activityType,
            status: existing.status === 'completed' ? 'completed' : 'in_progress',
            startedAt: existing.startedAt ?? now,
            activityId: existing.activityId ?? input.activityId,
            attemptsCount: nextAttemptsCount,
            lastInteractionAt: now,
            timeSpentSeconds: nextTimeSpentSeconds,
            metadataJson: mergeActivityProgressMetadata({
                existingMetadata: existing.metadataJson,
                eventType: 'INTERACTION',
                source: input.source ?? 'chat-api',
                details: {
                    previousStatus: existing.status,
                    status: existing.status === 'completed' ? 'completed' : 'in_progress',
                    interactionDeltaSeconds,
                    rawElapsedSeconds,
                    totalTimeSpentSeconds: nextTimeSpentSeconds
                }
            }),
            updatedAt: now
        })
        .where(eq(learningActivityProgress.id, existing.id));

    await db.insert(learningProgressEvent).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        courseId: input.courseId,
        activityId: input.activityId,
        eventType: 'progressed',
        eventAt: now,
        source: input.source ?? 'chat-api',
        payloadJson: buildLearningProgressEventPayload({
            source: input.source ?? 'chat-api',
            status: existing.status === 'completed' ? 'completed' : 'in_progress',
            details: {
                status: existing.status === 'completed' ? 'completed' : 'in_progress',
                interactionDeltaSeconds,
                rawElapsedSeconds,
                totalTimeSpentSeconds: nextTimeSpentSeconds,
                mode: 'updated'
            }
        }),
        correlationId: null,
        createdAt: now,
        updatedAt: now
    });

    await syncCourseProgressSummary(input.userId, input.courseId, input.source ?? 'chat-api');
}

export async function markActivityCompleted(input: ProgressWriteInput): Promise<void> {
    const now = new Date();

    const existing = await db
        .select()
        .from(learningActivityProgress)
        .where(
            and(
                eq(learningActivityProgress.userId, input.userId),
                eq(learningActivityProgress.courseId, input.courseId),
                eq(learningActivityProgress.activityId, input.activityId)
            )
        )
        .get();

    if (!existing) {
        await db.insert(learningActivityProgress).values({
            id: crypto.randomUUID(),
            userId: input.userId,
            courseId: input.courseId,
            activityId: input.activityId,
            activityType: input.activityType ?? 'chat',
            status: 'completed',
            startedAt: now,
            completedAt: now,
            lastInteractionAt: now,
            attemptsCount: 1,
            timeSpentSeconds: 0,
            metadataJson: mergeActivityProgressMetadata({
                existingMetadata: null,
                eventType: 'COMPLETED',
                source: input.source ?? 'chat-api',
                details: { status: 'completed' }
            }),
            createdAt: now,
            updatedAt: now
        });

        await db.insert(learningProgressEvent).values({
            id: crypto.randomUUID(),
            userId: input.userId,
            courseId: input.courseId,
            activityId: input.activityId,
            eventType: 'completed',
            eventAt: now,
            source: input.source ?? 'chat-api',
            payloadJson: buildLearningProgressEventPayload({
                source: input.source ?? 'chat-api',
                status: 'completed',
                details: {
                    status: 'completed',
                    mode: 'created'
                }
            }),
            correlationId: null,
            createdAt: now,
            updatedAt: now
        });

        await syncCourseProgressSummary(input.userId, input.courseId, input.source ?? 'chat-api');
        return;
    }

    const completionTimestamp = existing.completedAt ?? now;
    const baselineTimestamp = existing.lastInteractionAt ?? existing.startedAt ?? completionTimestamp;
    const rawCompletionDeltaSeconds = existing.completedAt
        ? 0
        : Math.max(0, Math.floor((completionTimestamp.getTime() - baselineTimestamp.getTime()) / 1000));
    const derivedDurationSeconds = Math.min(rawCompletionDeltaSeconds, MAX_INTERACTION_GAP_SECONDS);
    const nextTimeSpentSeconds = Math.max(0, existing.timeSpentSeconds + derivedDurationSeconds);

    await db
        .update(learningActivityProgress)
        .set({
            activityType: input.activityType ?? existing.activityType,
            status: 'completed',
            completedAt: completionTimestamp,
            lastInteractionAt: now,
            activityId: existing.activityId ?? input.activityId,
            attemptsCount: Math.max(1, existing.attemptsCount),
            timeSpentSeconds: nextTimeSpentSeconds,
            metadataJson: mergeActivityProgressMetadata({
                existingMetadata: existing.metadataJson,
                eventType: 'COMPLETED',
                source: input.source ?? 'chat-api',
                details: {
                    previousStatus: existing.status,
                    status: 'completed',
                    rawCompletionDeltaSeconds,
                    derivedDurationSeconds,
                    totalTimeSpentSeconds: nextTimeSpentSeconds
                }
            }),
            updatedAt: now
        })
        .where(eq(learningActivityProgress.id, existing.id));

    await db.insert(learningProgressEvent).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        courseId: input.courseId,
        activityId: input.activityId,
        eventType: 'completed',
        eventAt: now,
        source: input.source ?? 'chat-api',
        payloadJson: buildLearningProgressEventPayload({
            source: input.source ?? 'chat-api',
            status: 'completed',
            details: {
                status: 'completed',
                rawCompletionDeltaSeconds,
                derivedDurationSeconds,
                totalTimeSpentSeconds: nextTimeSpentSeconds,
                mode: 'updated'
            }
        }),
        correlationId: null,
        createdAt: now,
        updatedAt: now
    });

    await syncCourseProgressSummary(input.userId, input.courseId, input.source ?? 'chat-api');
}
