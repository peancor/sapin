/**
 * POST /api/agent-chat/[ilcid]/chat
 * Crea una nueva sesión de chat agéntico para el usuario actual.
 *
 * GET /api/agent-chat/[ilcid]/chat
 * Devuelve el chat más reciente del usuario para esta actividad (o null).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { InteractiveChatAuthUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { markActivityInProgress } from '$lib/server/db/ProgressWriteUtils';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';

const createChatPayloadSchema = z.object({
    courseId: z.string().min(1).optional()
});

export const GET: RequestHandler = async ({ params, locals }) => {
    const userId = locals.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

    const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
        userId, params.ilcid, locals.user!.highestRoleLevel
    );
    if (!access.allowed) {
        return json({ error: access.reason || 'Sin acceso a esta actividad' }, { status: 403 });
    }

    try {
        const agentActivity = await DBAgentUtils.getAgentActivity(params.ilcid);
        if (!agentActivity) {
            return json({ error: 'Actividad agéntica no encontrada' }, { status: 404 });
        }

        const existingUserChat = await db
            .select({ chat: schema.chat })
            .from(schema.userInteractiveLearningChat)
            .where(and(
                eq(schema.userInteractiveLearningChat.userId, userId),
                eq(schema.userInteractiveLearningChat.interactiveLearningChatId, params.ilcid)
            ))
            .leftJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
            .orderBy(desc(schema.chat.createdAt))
            .limit(1);

        const result = existingUserChat[0];
        return json({ chat: result?.chat ?? null });
    } catch (error) {
        console.error('[agent-chat] GET chat error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const userId = locals.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

    const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
        userId, params.ilcid, locals.user!.highestRoleLevel
    );
    if (!access.allowed) {
        return json({ error: access.reason || 'Sin acceso a esta actividad' }, { status: 403 });
    }

    try {
        const parsedBody = createChatPayloadSchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return json({ error: 'Invalid request payload' }, { status: 400 });
        }

        let resolvedCourseId = parsedBody.data.courseId;

        if (resolvedCourseId) {
            const belongsToCourse = await CourseInteractiveAuthUtils.verifyInteractiveBelongsToCourse(
                resolvedCourseId, params.ilcid
            );
            if (!belongsToCourse) {
                return json({ error: 'Actividad no válida para este curso' }, { status: 400 });
            }
        } else {
            const firstCourseRelation = await db
                .select({ courseId: schema.courseInteractiveLearning.courseId })
                .from(schema.courseInteractiveLearning)
                .where(eq(schema.courseInteractiveLearning.interactiveLearningId, params.ilcid))
                .limit(1);
            resolvedCourseId = firstCourseRelation[0]?.courseId;
        }

        // Verificar que existe la configuración agéntica
        const agentActivity = await DBAgentUtils.getAgentActivity(params.ilcid);
        if (!agentActivity) {
            return json({ error: 'Configuración agéntica no encontrada' }, { status: 404 });
        }

        // Crear el chat
        const [newChat] = await db.insert(schema.chat).values({
            id: nanoid(),
            userId,
            title: 'Agent Chat',
            metadata: JSON.stringify({
                agentActivityId: params.ilcid,
                mode: 'agent'
            }),
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        if (!newChat) throw new Error('Failed to create chat');

        // Vincular con la actividad
        await db.insert(schema.userInteractiveLearningChat).values({
            id: nanoid(),
            userId,
            interactiveLearningChatId: params.ilcid,
            chatId: newChat.id,
            createdAt: new Date()
        });

        if (resolvedCourseId) {
            await markActivityInProgress({
                userId,
                courseId: resolvedCourseId,
                activityId: params.ilcid,
                source: 'agent-chat:create'
            });
        }

        return json({ chatId: newChat.id });
    } catch (error) {
        console.error('[agent-chat] POST chat error:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
