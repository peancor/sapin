import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, InteractiveChatAuthUtils } from '$lib/server/db';
import {
    chat,
    userInteractiveLearningChat,
    interactiveLearningChat,
    courseInteractiveLearning
} from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { markActivityInProgress } from '$lib/server/db/ProgressWriteUtils';
import { CourseInteractiveAuthUtils } from '$lib/server/db';

const createChatPayloadSchema = z.object({
    courseId: z.string().min(1).optional()
});

export const GET: RequestHandler = async ({ params, locals }) => {
    const userId = locals.user?.id;
    if (!userId) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar acceso a la actividad
    const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
        userId, params.ilcid, locals.user!.highestRoleLevel
    );
    if (!access.allowed) {
        return json({ error: access.reason || 'Sin acceso a esta actividad' }, { status: 403 });
    }

    try {
        // Primero obtenemos el interactiveLearningChat asociado a la actividad (el id del chat ES el interactiveLearningId)
        const ilChat = await db
            .select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilcid))
            .limit(1);

        if (!ilChat.length) {
            return json({ error: 'Interactive learning chat not found' }, { status: 404 });
        }

        // Buscar el chat existente para esta actividad y usuario
        const existingUserChat = await db
            .select({
                chat: chat
            })
            .from(userInteractiveLearningChat)
            .where(and(
                eq(userInteractiveLearningChat.userId, userId),
                eq(userInteractiveLearningChat.interactiveLearningChatId, ilChat[0].id)
            ))
            .leftJoin(chat, eq(chat.id, userInteractiveLearningChat.chatId))
            .orderBy(desc(chat.createdAt))
            .limit(1);

        const result = existingUserChat[0];

        if (!result || !result.chat) {
            return json({ chat: null });
        }

        return json({ chat: result.chat });
    } catch (error) {
        console.error('Error getting chat:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const userId = locals.user?.id;
    if (!userId) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar acceso a la actividad
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
                resolvedCourseId,
                params.ilcid
            );
            if (!belongsToCourse) {
                return json({ error: 'Actividad no válida para este curso' }, { status: 400 });
            }
        } else {
            const firstCourseRelation = await db
                .select({ courseId: courseInteractiveLearning.courseId })
                .from(courseInteractiveLearning)
                .where(eq(courseInteractiveLearning.interactiveLearningId, params.ilcid))
                .limit(1);

            resolvedCourseId = firstCourseRelation[0]?.courseId;
        }

        // Primero obtenemos el interactiveLearningChat asociado a la actividad (el id del chat ES el interactiveLearningId)
        const ilChat = await db
            .select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilcid))
            .limit(1);

        if (!ilChat.length) {
            return json({ error: 'Interactive learning chat not found' }, { status: 404 });
        }

        // Crear un nuevo chat con el system prompt del interactiveLearningChat
        const newChat = await db.insert(chat).values({
            id: nanoid(),
            userId,
            title: 'Activity Chat',
            metadata: JSON.stringify({
                systemPrompt: ilChat[0].systemPrompt || '',
                interactiveLearningChatId: ilChat[0].id
            }),
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        if (!newChat.length) {
            throw new Error('Failed to create chat');
        }

        // Vincular el chat con la actividad y el usuario
        await db.insert(userInteractiveLearningChat).values({
            id: nanoid(),
            userId,
            interactiveLearningChatId: ilChat[0].id,
            chatId: newChat[0].id,
            createdAt: new Date()
        });

        if (resolvedCourseId) {
            await markActivityInProgress({
                userId,
                courseId: resolvedCourseId,
                activityId: ilChat[0].id,
                source: 'interactive-chat:create'
            });
        } else {
            console.warn('[Progress] chat created without resolvable courseId', {
                userId,
                activityId: ilChat[0].id
            });
        }

        return json({ chatId: newChat[0].id });
    } catch (error) {
        console.error('Error creating chat:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
