import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { CourseRoleUtils } from '$lib/server/db';

// Nivel mínimo requerido para acceder a teacher (50 = teacher, 90 = admin, 100 = super_admin)
const TEACHER_LEVEL = 50;

export const load = (async ({ locals }) => {
    const user = locals.user;
    
    // Verificar autenticación y nivel de rol usando el nuevo sistema
    if (!user || user.highestRoleLevel < TEACHER_LEVEL) {
        throw redirect(303, '/login');
    }

    // Obtener cursos donde el usuario tiene rol de teacher o superior
    const userCourses = await CourseRoleUtils.getUserCourses(user.id);
    const teacherCourses = userCourses
        .filter(c => ['owner', 'admin', 'teacher', 'assistant'].includes(c.role))
        .map(c => ({
            id: c.courseId,
            name: c.courseName,
            description: c.courseDescription,
            image: c.courseImage
        }));

    return {
        courses: teacherCourses
    };
}) satisfies LayoutServerLoad;