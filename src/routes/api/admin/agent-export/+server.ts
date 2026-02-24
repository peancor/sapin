/**
 * GET /api/admin/agent-export?activityId=xxx
 * Exporta los resultados estructurados (respuestas a componentes UI) de una actividad agéntica.
 * Requiere rol ADMIN.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ROLE_LEVELS } from '$lib/server/roles';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';

export const GET: RequestHandler = async ({ url, locals }) => {
    const user = locals.user;
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (user.highestRoleLevel < ROLE_LEVELS.ADMIN) return json({ error: 'Forbidden' }, { status: 403 });

    const activityId = url.searchParams.get('activityId');
    if (!activityId) {
        return json({ error: 'activityId is required' }, { status: 400 });
    }

    const results = await DBAgentUtils.getUIResponsesForActivity(activityId);

    // Return as JSON with content-disposition for download
    const filename = `agent-results-${activityId}-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(results, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`
        }
    });
};
