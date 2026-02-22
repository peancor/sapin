import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CourseRoleUtils } from '$lib/server/db';
import MoodleClient from '$lib/server/integrations/moodle/MoodleClient';
import { buildMoodleImportPreview } from '$lib/server/students/moodleImport';

interface PreviewRequestBody {
    baseUrl: string;
    token: string;
    moodleCourseId: string;
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasPermission = await CourseRoleUtils.userHasCoursePermission(
        locals.user.id,
        params.cid!,
        'manageUsers'
    );
    if (!hasPermission) {
        return json({ error: 'No tienes permisos para importar estudiantes en este curso' }, { status: 403 });
    }

    try {
        const body = (await request.json()) as Partial<PreviewRequestBody>;
        const baseUrl = body.baseUrl?.trim() || '';
        const token = body.token?.trim() || '';
        const moodleCourseId = body.moodleCourseId?.trim() || '';

        if (!baseUrl || !token || !moodleCourseId) {
            return json(
                { error: 'baseUrl, token y moodleCourseId son requeridos' },
                { status: 400 }
            );
        }

        const moodleClient = new MoodleClient(baseUrl, token);
        const students = await moodleClient.getCourseStudents(moodleCourseId);
        const preview = await buildMoodleImportPreview(params.cid!, students);

        return json({
            message: 'Preview generado',
            rows: preview.rows,
            summary: preview.summary
        });
    } catch (error) {
        return json(
            {
                error: 'No se pudo generar la previsualización desde Moodle',
                message: error instanceof Error ? error.message : 'Error desconocido'
            },
            { status: 500 }
        );
    }
};
