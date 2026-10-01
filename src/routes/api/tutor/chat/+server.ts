/**
 * POST /api/tutor/chat
 * Obtiene o crea el chat del asistente global de tutoría para el usuario actual.
 * Solo requiere autenticación (no necesita estar inscrito en ningún curso).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { DBAgentActivityUtils } from '$lib/server/db/agent';

export const POST: RequestHandler = async ({ locals }) => {
    const user = locals.user;
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    // Ensure global tutor is seeded
    await DBAgentActivityUtils.seedGlobalTutor();

    const chatId = await DBAgentActivityUtils.getOrCreateTutorChat(user.id);
    return json({ chatId, activityId: DBAgentActivityUtils.GLOBAL_TUTOR_ID });
};
