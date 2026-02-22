import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { learningActivityProgress, learningProgressEvent } from '$lib/server/db/schema';
import {
    buildLearningProgressEventPayload,
    mergeActivityProgressMetadata
} from '$lib/server/db/ProgressMetadataUtils';
import { and, eq } from 'drizzle-orm';

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
        console.warn('[Progress] start blocked: activity does not belong to course', {
            courseId: params.cid,
            activityId: params.activityId,
            userId
        });
        return new Response('Actividad no válida para este curso', { status: 400 });
    }

    // Find existing progress
    const [existingProgress] = await db
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

    if (!existingProgress) {
        await db.insert(learningActivityProgress).values({
            id: crypto.randomUUID(),
            userId,
            courseId: params.cid,
            activityId: params.activityId,
            activityType: 'manual',
            status: 'in_progress',
            startedAt: now,
            lastInteractionAt: now,
            attemptsCount: 1,
            timeSpentSeconds: 0,
            metadataJson: mergeActivityProgressMetadata({
                existingMetadata: null,
                eventType: 'STARTED',
                source: 'api',
                details: {
                    status: 'in_progress'
                }
            }),
            createdAt: now,
            updatedAt: now
        });

        await db.insert(learningProgressEvent).values({
            id: crypto.randomUUID(),
            userId,
            courseId: params.cid,
            activityId: params.activityId,
            eventType: 'started',
            eventAt: now,
            source: 'api',
            payloadJson: buildLearningProgressEventPayload({
                source: 'api',
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
    } else {
        await db
            .update(learningActivityProgress)
            .set({
                status: 'in_progress',
                lastInteractionAt: now,
                activityId: existingProgress.activityId ?? params.activityId,
                attemptsCount: existingProgress.attemptsCount + 1,
                metadataJson: mergeActivityProgressMetadata({
                    existingMetadata: existingProgress.metadataJson,
                    eventType: 'STARTED',
                    source: 'api',
                    details: {
                        attemptsCount: existingProgress.attemptsCount + 1,
                        status: 'in_progress'
                    }
                }),
                updatedAt: now
            })
            .where(eq(learningActivityProgress.id, existingProgress.id));

        await db.insert(learningProgressEvent).values({
            id: crypto.randomUUID(),
            userId,
            courseId: params.cid,
            activityId: params.activityId,
            eventType: 'progressed',
            eventAt: now,
            source: 'api',
            payloadJson: buildLearningProgressEventPayload({
                source: 'api',
                status: 'in_progress',
                details: {
                    status: 'in_progress',
                    attemptsCount: existingProgress.attemptsCount + 1,
                    mode: 'updated'
                }
            }),
            correlationId: null,
            createdAt: now,
            updatedAt: now
        });
    }

    return json({ success: true });
};