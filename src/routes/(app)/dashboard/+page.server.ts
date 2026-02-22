import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import { interactiveLearning, courseInteractiveLearning } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load = (async ({ locals }) => {
    const user = locals.user;

    // El dashboard requiere autenticación
    if (!user) {
        throw redirect(303, '/login');
    }

    // Obtener todos los cursos del usuario usando el sistema de roles por curso
    const userCourses = await CourseRoleUtils.getUserCourses(user.id);

    // Separar cursos por tipo de rol
    const teacherRoles = ['owner', 'admin', 'teacher', 'assistant'];

    const coursesWithDetails = await Promise.all(userCourses.map(async (c) => {
        // Contar actividades del curso
        const activities = await db
            .select()
            .from(interactiveLearning)
            .innerJoin(
                courseInteractiveLearning,
                eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
            )
            .where(eq(courseInteractiveLearning.courseId, c.courseId));

        return {
            id: c.courseId,
            name: c.courseName,
            description: c.courseDescription,
            image: c.courseImage,
            role: c.role,
            roleLevel: c.level,
            isTeacher: teacherRoles.includes(c.role),
            activityCount: activities.length
        };
    }));

    // Separar en cursos como docente y como estudiante
    const teachingCourses = coursesWithDetails.filter(c => c.isTeacher);
    const learningCourses = coursesWithDetails.filter(c => !c.isTeacher);

    return {
        user,
        teachingCourses,
        learningCourses,
        totalCourses: coursesWithDetails.length
    };
}) satisfies PageServerLoad;
