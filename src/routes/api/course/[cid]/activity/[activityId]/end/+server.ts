import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { learningActivityProgress } from '$lib/server/db/schema';
import {
    activityProgressMetadataPatchSchema,
    mergeActivityProgressMetadata
} from '$lib/server/db/ProgressMetadataUtils';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const endActivityPayloadSchema = z.object({
    duration: z.number().int().nonnegative().default(0),
    metadataPatch: activityProgressMetadataPatchSchema.optional()
});

export const POST: RequestHandler = async ({ params, locals, request }) => {
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
        console.warn('[Progress] end blocked: activity does not belong to course', {
            courseId: params.cid,
            activityId: params.activityId,
            userId
        });
        return new Response('Actividad no válida para este curso', { status: 400 });
    }

    const parsedBody = endActivityPayloadSchema.safeParse(await request.json());
    if (!parsedBody.success) {
        return new Response('Invalid request payload', { status: 400 });
    }

    const { duration, metadataPatch } = parsedBody.data;

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

    if (progressRecord) {
        await db
            .update(learningActivityProgress)
            .set({
                timeSpentSeconds: progressRecord.timeSpentSeconds + duration,
                lastInteractionAt: new Date(),
                activityId: progressRecord.activityId ?? params.activityId,
                metadataJson: mergeActivityProgressMetadata({
                    existingMetadata: progressRecord.metadataJson,
                    patch: metadataPatch,
                    eventType: 'INTERACTION',
                    source: 'api',
                    details: {
                        duration,
                        totalTimeSpentSeconds: progressRecord.timeSpentSeconds + duration
                    }
                }),
                updatedAt: new Date()
            })
            .where(eq(learningActivityProgress.id, progressRecord.id));
    } else {
        console.warn('[Progress] end called without existing progress record', {
            courseId: params.cid,
            activityId: params.activityId,
            userId,
            duration
        });
    }

    return json({ success: true });
};