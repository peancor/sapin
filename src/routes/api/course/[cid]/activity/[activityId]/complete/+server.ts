import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { learningActivityProgress, learningProgressEvent } from '$lib/server/db/schema';
import {
    buildLearningProgressEventPayload,
    mergeActivityProgressMetadata
} from '$lib/server/db/ProgressMetadataUtils';
import { and, eq } from 'drizzle-orm';
import { notificationService } from '$lib/server/notifications';

const MAX_COMPLETION_GAP_SECONDS = 15 * 60;

export const POST: RequestHandler = async ({ params, locals }) => {
    const userId = locals.user?.id;
    if (!userId) {
        return new Response('Unauthorized', { status: 401 });
    }

    // Verificar que el usuario está matriculado en el curso
    const userRoles = await CourseRoleUtils.getUserCourseRoles(userId, params.cid!);
    if (userRoles.length === 0) {
        return new Response('No estás matriculado en este curso', { status: 403 });
    }

    const belongsToCourse = await CourseInteractiveAuthUtils.verifyInteractiveBelongsToCourse(
        params.cid,
        params.activityId
    );
    if (!belongsToCourse) {
        console.warn('[Progress] complete blocked: activity does not belong to course', {
            courseId: params.cid,
            activityId: params.activityId,
            userId
        });
        return new Response('Actividad no válida para este curso', { status: 400 });
    }

    const [progressRecord] = await db
        .select()
        .from(learningActivityProgress)
        .where(
            and(
                eq(learningActivityProgress.userId, userId),
                eq(learningActivityProgress.courseId, params.cid),
                eq(learningActivityProgress.activityId, params.activityId)
            )
        )
        .limit(1);

    const now = new Date();

    if (progressRecord) {
        const completionTimestamp = progressRecord.completedAt ?? now;
        const baselineTimestamp =
            progressRecord.lastInteractionAt ?? progressRecord.startedAt ?? completionTimestamp;
        const rawCompletionDeltaSeconds = progressRecord.completedAt
            ? 0
            : Math.max(
                    0,
                    Math.floor(
                        (completionTimestamp.getTime() - baselineTimestamp.getTime()) / 1000
                    )
                );
        const derivedDurationSeconds = Math.min(
            rawCompletionDeltaSeconds,
            MAX_COMPLETION_GAP_SECONDS
        );
        const nextTimeSpentSeconds = Math.max(
            0,
            progressRecord.timeSpentSeconds + derivedDurationSeconds
        );

        await db
            .update(learningActivityProgress)
            .set({
                status: 'completed',
                completedAt: completionTimestamp,
                lastInteractionAt: now,
                activityId: progressRecord.activityId ?? params.activityId,
                attemptsCount: Math.max(1, progressRecord.attemptsCount),
                timeSpentSeconds: nextTimeSpentSeconds,
                metadataJson: mergeActivityProgressMetadata({
                    existingMetadata: progressRecord.metadataJson,
                    eventType: 'COMPLETED',
                    source: 'api',
                    details: {
                        status: 'completed',
                        rawCompletionDeltaSeconds,
                        derivedDurationSeconds,
                        totalTimeSpentSeconds: nextTimeSpentSeconds
                    }
                }),
                updatedAt: now
            })
            .where(eq(learningActivityProgress.id, progressRecord.id));
    } else {
        await db.insert(learningActivityProgress).values({
            id: crypto.randomUUID(),
            userId,
            courseId: params.cid,
            activityId: params.activityId,
            activityType: 'manual',
            status: 'completed',
            startedAt: now,
            completedAt: now,
            lastInteractionAt: now,
            attemptsCount: 1,
            timeSpentSeconds: 0,
            metadataJson: mergeActivityProgressMetadata({
                existingMetadata: null,
                eventType: 'COMPLETED',
                source: 'api',
                details: {
                    status: 'completed'
                }
            }),
            createdAt: now,
            updatedAt: now
        });
    }

    await db.insert(learningProgressEvent).values({
        id: crypto.randomUUID(),
        userId,
        courseId: params.cid,
        activityId: params.activityId,
        eventType: 'completed',
        eventAt: now,
        source: 'api',
        payloadJson: buildLearningProgressEventPayload({
            source: 'api',
            status: 'completed',
            details: {
                status: 'completed',
                mode: progressRecord ? 'updated' : 'created'
            }
        }),
        correlationId: null,
        createdAt: now,
        updatedAt: now
    });

    // Send notification to course teachers
    notificationService
        .notifyActivityCompleted(userId, params.cid, params.activityId)
        .catch((err) => console.error('Error sending activity completed notification:', err));

    return json({ success: true });
};