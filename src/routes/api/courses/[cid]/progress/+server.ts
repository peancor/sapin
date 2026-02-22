import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import {
    learningActivityProgress,
    courseProgressSummary,
    learningProgressEvent,
    courseInteractiveLearning
} from '$lib/server/db/schema';
import { calculateCourseProgressSummary } from '$lib/server/db/ProgressUtils';
import {
    activityProgressMetadataPatchSchema,
    buildLearningProgressEventPayload,
    courseProgressSummaryMetadataPatchSchema,
    mergeCourseProgressSummaryMetadata,
    mergeActivityProgressMetadata
} from '$lib/server/db/ProgressMetadataUtils';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const progressPayloadSchema = z.object({
    userId: z.string().min(1),
    activityId: z.string().min(1),
    status: z.enum(['not_started', 'in_progress', 'completed']),
    timeSpentSeconds: z.number().int().nonnegative().optional(),
    scoreRaw: z.number().int().optional(),
    metadataPatch: activityProgressMetadataPatchSchema.optional(),
    summaryMetadataPatch: courseProgressSummaryMetadataPatchSchema.optional()
});

export const POST: RequestHandler = async ({ request, params }) => {
    const parsedPayload = progressPayloadSchema.safeParse(await request.json());
    if (!parsedPayload.success) {
        return new Response('Invalid request payload', { status: 400 });
    }

    const {
        userId,
        activityId,
        status,
        timeSpentSeconds,
        scoreRaw,
        metadataPatch,
        summaryMetadataPatch
    } =
        parsedPayload.data;
    const { cid } = params;
    const now = new Date();

    const belongsToCourse = await CourseInteractiveAuthUtils.verifyInteractiveBelongsToCourse(
        cid,
        activityId
    );
    if (!belongsToCourse) {
        console.warn('[Progress] update blocked: activity does not belong to course', {
            courseId: cid,
            activityId,
            userId
        });
        return new Response('Actividad no válida para este curso', { status: 400 });
    }

    // Actualizar o crear el progreso de la actividad
    const existingProgress = await db
        .select()
        .from(learningActivityProgress)
        .where(and(
            eq(learningActivityProgress.userId, userId),
            eq(learningActivityProgress.courseId, cid),
            eq(learningActivityProgress.activityId, activityId)
        ))
        .get();

    let progressEventType: 'started' | 'progressed' | 'completed' = 'progressed';

    if (existingProgress) {
        if (status === 'completed') {
            progressEventType = 'completed';
        } else {
            progressEventType = 'progressed';
        }

        await db
            .update(learningActivityProgress)
            .set({
                status,
                activityId: existingProgress.activityId ?? activityId,
                timeSpentSeconds: existingProgress.timeSpentSeconds + (timeSpentSeconds || 0),
                scoreRaw: scoreRaw !== undefined ? scoreRaw : existingProgress.scoreRaw,
                attemptsCount: existingProgress.attemptsCount + 1,
                lastInteractionAt: now,
                completedAt: status === 'completed' ? now : existingProgress.completedAt,
                metadataJson: mergeActivityProgressMetadata({
                    existingMetadata: existingProgress.metadataJson,
                    patch: metadataPatch,
                    eventType: status === 'completed' ? 'COMPLETED' : 'UPDATED',
                    source: 'api',
                    details: {
                        status,
                        timeSpentSeconds: timeSpentSeconds || 0,
                        scoreRaw
                    }
                }),
                updatedAt: now
            })
            .where(eq(learningActivityProgress.id, existingProgress.id));
    } else {
        if (status === 'completed') {
            progressEventType = 'completed';
        } else if (status === 'in_progress') {
            progressEventType = 'started';
        } else {
            progressEventType = 'progressed';
        }

        await db
            .insert(learningActivityProgress)
            .values({
                id: nanoid(),
                userId,
                courseId: cid,
                activityId,
                activityType: 'manual',
                status,
                timeSpentSeconds: timeSpentSeconds || 0,
                scoreRaw,
                startedAt: now,
                completedAt: status === 'completed' ? now : null,
                lastInteractionAt: now,
                attemptsCount: 1,
                metadataJson: mergeActivityProgressMetadata({
                    existingMetadata: null,
                    patch: metadataPatch,
                    eventType: status === 'completed' ? 'COMPLETED' : 'UPDATED',
                    source: 'api',
                    details: {
                        status,
                        timeSpentSeconds: timeSpentSeconds || 0,
                        scoreRaw
                    }
                }),
                createdAt: now,
                updatedAt: now
            });
    }

    await db.insert(learningProgressEvent).values({
        id: nanoid(),
        userId,
        courseId: cid,
        activityId,
        eventType: progressEventType,
        eventAt: now,
        source: 'api',
        payloadJson: buildLearningProgressEventPayload({
            source: 'api',
            status,
            details: {
                status,
                timeSpentSeconds: timeSpentSeconds || 0,
                scoreRaw,
                mode: existingProgress ? 'updated' : 'created'
            }
        }),
        correlationId: null,
        createdAt: now,
        updatedAt: now
    });

    // Actualizar el progreso general del estudiante en el curso
    const existingStudentProgress = await db
        .select()
        .from(courseProgressSummary)
        .where(and(
            eq(courseProgressSummary.userId, userId),
            eq(courseProgressSummary.courseId, cid)
        ))
        .get();

    const [activityRecords, courseActivities] = await Promise.all([
        db
            .select()
            .from(learningActivityProgress)
            .where(and(
                eq(learningActivityProgress.userId, userId),
                eq(learningActivityProgress.courseId, cid)
            ))
            .all(),
        db
            .select({ activityId: courseInteractiveLearning.interactiveLearningId })
            .from(courseInteractiveLearning)
            .where(eq(courseInteractiveLearning.courseId, cid))
            .all()
    ]);

    const totalActivities = courseActivities.length;

    const progressSummary = calculateCourseProgressSummary(activityRecords, totalActivities, {
        context: `api/courses/${cid}/progress:user:${userId}`
    });
    const inProgressActivitiesCount = activityRecords.filter(
        (record) => record.status === 'in_progress'
    ).length;

    if (existingStudentProgress) {
        await db
            .update(courseProgressSummary)
            .set({
                completedActivities: progressSummary.completedActivities,
                inProgressActivities: inProgressActivitiesCount,
                completionRate: progressSummary.completionRate,
                totalTimeSpentSeconds: progressSummary.totalTimeSpent,
                lastActivityAt: progressSummary.lastActivityAt,
                metadataJson: mergeCourseProgressSummaryMetadata({
                    existingMetadata: existingStudentProgress.metadataJson,
                    patch: summaryMetadataPatch,
                    source: 'api',
                    totalActivities,
                    completedFromStatusCount: progressSummary.completedActivities,
                    inProgressFromStatusCount: inProgressActivitiesCount
                }),
                updatedAt: now
            })
            .where(eq(courseProgressSummary.id, existingStudentProgress.id));
    } else {
        await db
            .insert(courseProgressSummary)
            .values({
                id: nanoid(),
                userId,
                courseId: cid,
                completedActivities: progressSummary.completedActivities,
                inProgressActivities: inProgressActivitiesCount,
                completionRate: progressSummary.completionRate,
                totalTimeSpentSeconds: progressSummary.totalTimeSpent,
                lastActivityAt: progressSummary.lastActivityAt,
                metadataJson: mergeCourseProgressSummaryMetadata({
                    existingMetadata: null,
                    patch: summaryMetadataPatch,
                    source: 'api',
                    totalActivities,
                    completedFromStatusCount: progressSummary.completedActivities,
                    inProgressFromStatusCount: inProgressActivitiesCount
                }),
                createdAt: now,
                updatedAt: now
            });
    }

    return json({ success: true });
};