import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { DBAgentActivityUtils } from '$lib/server/db/agent';

export const load = (async ({ params, locals }) => {
    const { ilid } = params;
    const user = locals.user;

    if (!user) throw error(401, 'Not authenticated');

    // Verificar acceso a la actividad
    const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
        user.id, ilid, user.highestRoleLevel
    );
    if (!access.allowed) {
        throw error(403, access.reason || 'Sin acceso a esta actividad');
    }

    // Cargar datos de la actividad
    const [interactiveLearning] = await db
        .select()
        .from(schema.interactiveLearning)
        .where(eq(schema.interactiveLearning.id, ilid));

    if (!interactiveLearning) throw error(404, 'Actividad no encontrada');

    const agentActivity = await DBAgentActivityUtils.getAgentActivity(ilid);
    if (!agentActivity) throw error(404, 'Configuración agéntica no encontrada');

    // Cargar chats anteriores del usuario
    const userChats = await db
        .select({ chat: schema.chat })
        .from(schema.userInteractiveLearningChat)
        .where(and(
            eq(schema.userInteractiveLearningChat.userId, user.id),
            eq(schema.userInteractiveLearningChat.interactiveLearningChatId, ilid)
        ))
        .leftJoin(schema.chat, eq(schema.chat.id, schema.userInteractiveLearningChat.chatId))
        .orderBy(desc(schema.chat.createdAt));

    return {
        interactiveLearning,
        agentActivity,
        userChats: userChats.map((r) => r.chat).filter(Boolean)
    };
}) satisfies PageServerLoad;
