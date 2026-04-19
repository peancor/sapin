import { error, redirect } from '@sveltejs/kit';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { interactiveLearning } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import {
	loadAgentStudentsPageData,
	loadChatStudentsPageData,
	loadLessonStudentsPageData
} from './pageData.server';

export const load = (async ({ params, locals }) => {
    // Verificación de seguridad (defensa en profundidad)
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    const { cid, ilid } = params;
    const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
        locals.user.id, cid, ilid, locals.user.highestRoleLevel
    );

    if (!access.allowed) {
        throw error(403, access.reason || 'No tienes permisos para ver esta información');
    }

    // Verificar que el interactive learning existe y obtener su tipo
    const interactive = await db
        .select()
        .from(interactiveLearning)
        .where(eq(interactiveLearning.id, ilid))
        .get();

	if (!interactive) {
		throw error(404, 'Actividad no encontrada');
	}

	switch (interactive.type) {
		case 'lesson':
			return loadLessonStudentsPageData(cid, interactive);
		case 'agent':
			return loadAgentStudentsPageData(cid, interactive);
		case 'chat':
			return loadChatStudentsPageData(cid, interactive);
		default:
			throw error(400, 'Tipo de actividad no soportado en la sección de estudiantes');
	}
}) satisfies PageServerLoad;
