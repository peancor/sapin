import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { interactiveLearning, course } from '$lib/server/db/schema';

export const load = (async ({ params, locals }) => {
	const { ilid, cid } = params;
	const user = locals.user;

	// Verificar autenticación
	if (!user) {
		throw redirect(303, '/login');
	}

	// Verificar permisos de administración para esta actividad en este curso
	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		user.id,
		cid,
		ilid,
		user.highestRoleLevel
	);

	if (!access.allowed) {
		if (access.reason === 'La actividad no pertenece a este curso') {
			throw error(404, 'Actividad no encontrada en este curso');
		}
		throw error(403, access.reason || 'No tienes permisos para administrar esta actividad');
	}

	// Load the interactive learning
	const interactiveData = await db
		.select()
		.from(interactiveLearning)
		.where(eq(interactiveLearning.id, ilid))
		.limit(1);

	if (!interactiveData || interactiveData.length === 0) {
		throw error(404, 'Interactive not found');
	}

	// Load the course data for the sidebar
	const courseData = await db
		.select()
		.from(course)
		.where(eq(course.id, cid))
		.limit(1);

	if (!courseData || courseData.length === 0) {
		throw error(404, 'Course not found');
	}

	return {
		interactive: interactiveData[0],
		course: courseData[0],
		userAccess: {
			isSystemAdmin: access.isSystemAdmin,
			courseRole: access.courseRole
		}
	};
}) satisfies LayoutServerLoad;

