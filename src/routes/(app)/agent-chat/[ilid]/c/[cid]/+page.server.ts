import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { AgentTranscriptService } from '$lib/server/agent';

export const load = (async ({ params, locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Not authenticated');

    const { ilid, cid } = params;

    // Verificar acceso al chat
    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, cid, ilid, user.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        throw error(403, chatAccess.reason || 'No tienes acceso a este chat');
    }

    const displayMessages = await AgentTranscriptService.getDisplayMessages(cid);

    // Cargar datos de la actividad para mostrar en el header
    const [interactiveLearning] = await db
        .select()
        .from(schema.interactiveLearning)
        .where(eq(schema.interactiveLearning.id, ilid));

    return {
        chatId: cid,
        activityId: ilid,
        messages: displayMessages,
        interactiveLearning,
        isOwner: chatAccess.isOwner,
        user: {
            username: user.username ?? undefined,
            alias: user.alias ?? undefined
        }
    };
}) satisfies PageServerLoad;
