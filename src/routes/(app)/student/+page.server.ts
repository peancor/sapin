import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import { interactiveLearning, courseInteractiveLearning } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';

export const load = (async ({ locals }) => {
    const user = locals.user;
    
    // Cualquier usuario autenticado puede acceder a sus cursos como estudiante
    if (!user || user.highestRoleLevel < ROLE_LEVELS.STUDENT) {
        throw redirect(303, '/login');
    }

    // Obtener cursos del usuario usando el nuevo sistema de roles por curso
    const userCourses = await CourseRoleUtils.getUserCourses(user.id);
    const studentCourses = userCourses.map(c => ({
        id: c.courseId,
        name: c.courseName,
        description: c.courseDescription,
        image: c.courseImage
    }));

    // For each course, get the number of activities
    const coursesWithStats = await Promise.all(studentCourses.map(async (course) => {
        const activities = await db
            .select()
            .from(interactiveLearning)
            .innerJoin(
                courseInteractiveLearning,
                eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
            )
            .where(eq(courseInteractiveLearning.courseId, course.id));

        return {
            ...course,
            activityCount: activities.length
        };
    }));

    return {
        courses: coursesWithStats
    };
}) satisfies PageServerLoad;