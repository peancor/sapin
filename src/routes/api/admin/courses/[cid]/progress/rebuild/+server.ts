import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
    rebuildCourseProgress,
    rebuildProgressMode
} from '$lib/server/db/ProgressRebuildUtils';

const ADMIN_LEVEL = 90;

const rebuildPayloadSchema = z.object({
    mode: z.enum([rebuildProgressMode.FILL_MISSING, rebuildProgressMode.REBUILD_ALL])
});

function checkAdminAccess(locals: App.Locals) {
    if (!locals.user || locals.user.highestRoleLevel < ADMIN_LEVEL) {
        error(403, 'Acceso denegado');
    }
}

export const POST: RequestHandler = async ({ locals, request, params }) => {
    checkAdminAccess(locals);

    const parsedPayload = rebuildPayloadSchema.safeParse(await request.json());
    if (!parsedPayload.success) {
        return json({ success: false, error: 'Payload inválido' }, { status: 400 });
    }

    try {
        const result = await rebuildCourseProgress({
            courseId: params.cid,
            mode: parsedPayload.data.mode,
            requestedBy: locals.user?.id
        });

        return json({ success: true, result });
    } catch (err) {
        console.error('[ProgressRebuild] Error rebuilding course progress', {
            courseId: params.cid,
            mode: parsedPayload.data.mode,
            error: err
        });

        return json(
            {
                success: false,
                error: err instanceof Error ? err.message : 'Error reconstruyendo progreso'
            },
            { status: 500 }
        );
    }
};
