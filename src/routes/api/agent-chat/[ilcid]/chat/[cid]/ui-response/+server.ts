/**
 * POST /api/agent-chat/[ilcid]/chat/[cid]/ui-response
 * Recibe la respuesta del usuario a un componente UI interactivo.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const user = locals.user;
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
        user.id, params.cid!, params.ilcid!, user.highestRoleLevel
    );
    if (!chatAccess.allowed) {
        return json({ error: chatAccess.reason || 'Sin acceso a este chat' }, { status: 403 });
    }

    let body: { instanceId: string; componentKey: string; payload: Record<string, unknown> };
    try {
        body = await request.json() as typeof body;
    } catch {
        return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { instanceId, payload } = body;
    if (!instanceId || !payload) {
        return json({ error: 'instanceId and payload are required' }, { status: 400 });
    }

    // Verificar que la instancia existe
    const instance = await DBAgentUtils.getUIInstance(instanceId);
    if (!instance) {
        return json({ error: 'UI instance not found' }, { status: 404 });
    }

    // Actualizar la instancia con la respuesta del usuario
    const score = typeof payload.score === 'number' ? payload.score : undefined;

    await DBAgentUtils.updateUIInstance(instanceId, {
        userResponse: JSON.stringify(payload),
        respondedAt: new Date(),
        ...(score !== undefined ? { score } : {})
    });

    return json({ success: true });
};
