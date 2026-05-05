import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { DBAgentActivityUtils } from '$lib/server/db/agent';
import { AgentTranscriptService } from '$lib/server/agent';

export const load = (async ({ params, locals }) => {
    const user = locals.user;
    if (!user) throw redirect(302, '/login');

    const { cid } = params;

    // Verify the chat belongs to this user
    const userChat = await db
        .select()
        .from(schema.userInteractiveLearningChat)
        .where(
            and(
                eq(schema.userInteractiveLearningChat.chatId, cid),
                eq(schema.userInteractiveLearningChat.userId, user.id)
            )
        )
        .get();

    if (!userChat) throw error(403, 'No tienes acceso a este chat');

    const displayMessages = await AgentTranscriptService.getDisplayMessages(cid);

    return {
        chatId: cid,
        activityId: DBAgentActivityUtils.GLOBAL_TUTOR_ID,
        messages: displayMessages,
        user: {
            username: user.username ?? undefined,
            alias: user.alias ?? undefined
        }
    };
}) satisfies PageServerLoad;
