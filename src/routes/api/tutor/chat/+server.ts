/**
 * POST /api/tutor/chat
 * Obtiene o crea el chat del asistente global de tutoría para el usuario actual.
 * Solo requiere autenticación (no necesita estar inscrito en ningún curso).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';

export const POST: RequestHandler = async ({ locals }) => {
    const user = locals.user;
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    // Ensure global tutor is seeded
    await DBAgentUtils.seedGlobalTutor();

    const chatId = await DBAgentUtils.getOrCreateTutorChat(user.id);
    return json({ chatId, activityId: DBAgentUtils.GLOBAL_TUTOR_ID });
};
