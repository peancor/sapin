import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import {
    course,
    interactiveLearning,
    courseInteractiveLearning,
    interactiveLearningChat,
    interactiveLearningFile,
    interactiveLearningRagDocument,
    userInteractiveLearningChat,
    chat,
    message
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { auditService, auditAction } from '$lib/server/logging';
import { getCourseLearningAnalytics } from '$lib/server/db/LearningAnalyticsUtils';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
}

export const load = (async ({ params }) => {
    const analytics = await getCourseLearningAnalytics(params.cid);

    return {
        analytics
    };
}) satisfies PageServerLoad;

export const actions = {
    updatecourse: async ({ request, params, locals }) => {
        const data = await request.formData();
        const name = data.get('name')?.toString();
        const description = data.get('description')?.toString();

        if (!name) throw error(400, 'Name is required');

        await db.update(course)
            .set({ name, description })
            .where(eq(course.id, params.cid));

        // Audit log
        await auditService.log({
            action: auditAction.COURSE_UPDATED,
            userId: locals.user?.id,
            targetType: 'course',
            targetId: params.cid,
            details: { name, description },
            ipAddress: getClientIP(request),
            userAgent: request.headers.get('user-agent'),
            severity: 'info'
        });

        return { success: true };
    },

    deleteInteractive: async ({ request, params, locals }) => {
        const data = await request.formData();
        const interactiveId = data.get('id')?.toString();

        if (!interactiveId) throw error(400, 'Interactive ID is required');

        // Obtener nombre de la actividad antes de eliminarla (para el audit log)
        const [activityData] = await db
            .select({ name: interactiveLearning.name, type: interactiveLearning.type })
            .from(interactiveLearning)
            .where(eq(interactiveLearning.id, interactiveId));

        await db.transaction(async (tx) => {
            // 1. Primero encontrar si es un chat interactivo (el id del chat ES el interactiveLearningId)
            const [chatInteractive] = await tx
                .select()
                .from(interactiveLearningChat)
                .where(eq(interactiveLearningChat.id, interactiveId));

            if (chatInteractive) {
                // 2. Borrar archivos asociados al chat
                await tx
                    .delete(interactiveLearningFile)
                    .where(eq(interactiveLearningFile.interactiveLearningId, chatInteractive.id));

                // 2b. Borrar documentos RAG asociados
                await tx
                    .delete(interactiveLearningRagDocument)
                    .where(eq(interactiveLearningRagDocument.interactiveLearningId, chatInteractive.id));

                // 3. Obtener las conexiones de usuarios con el chat
                const userChats = await tx
                    .select()
                    .from(userInteractiveLearningChat)
                    .where(eq(userInteractiveLearningChat.interactiveLearningChatId, chatInteractive.id));

                // 4. Borrar los mensajes de todos los chats
                for (const userChat of userChats) {
                    await tx
                        .delete(message)
                        .where(eq(message.chatId, userChat.chatId));
                }

                // 5. Borrar todas las conexiones de usuarios con el chat interactivo
                await tx
                    .delete(userInteractiveLearningChat)
                    .where(eq(userInteractiveLearningChat.interactiveLearningChatId, chatInteractive.id));

                // 6. Borrar todos los chats
                for (const userChat of userChats) {
                    await tx
                        .delete(chat)
                        .where(eq(chat.id, userChat.chatId));
                }

                // 7. Borrar la relación con el curso
/*                 await tx
                    .delete(courseInteractiveLearningChat)
                    .where(eq(courseInteractiveLearningChat.interactiveLearningChatId, chatInteractive.id)); */

                // 8. Borrar el chat interactivo
                await tx
                    .delete(interactiveLearningChat)
                    .where(eq(interactiveLearningChat.id, chatInteractive.id));
            }

            // 9. Borrar la conexión con el curso
            await tx
                .delete(courseInteractiveLearning)
                .where(eq(courseInteractiveLearning.interactiveLearningId, interactiveId));

            // 10. Finalmente borrar el interactivo
            await tx
                .delete(interactiveLearning)
                .where(eq(interactiveLearning.id, interactiveId));
        });

        // Audit log
        await auditService.log({
            action: auditAction.ACTIVITY_DELETED,
            userId: locals.user?.id,
            targetType: 'activity',
            targetId: interactiveId,
            details: { name: activityData?.name, type: activityData?.type, courseId: params.cid },
            ipAddress: getClientIP(request),
            userAgent: request.headers.get('user-agent'),
            severity: 'warning'
        });

        return { success: true };
    }
} satisfies Actions;
