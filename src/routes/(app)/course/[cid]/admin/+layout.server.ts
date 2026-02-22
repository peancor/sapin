import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import {
    course,
    courseInteractiveLearning,
    interactiveLearning,
    courseFile
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';

export const load = (async ({ locals, params }) => {

    const authUser = locals.user;
    if (!authUser) {
        throw redirect(303, '/login');
    }

    const { cid } = params;

    // Verificar acceso usando el nuevo sistema de roles por curso
    // Admin del sistema (nivel 90+) tiene acceso a todos los cursos
    // Otros usuarios necesitan tener rol en el curso con nivel >= assistant
    if (authUser.highestRoleLevel < ROLE_LEVELS.ADMIN) {
        const userCourseRole = await CourseRoleUtils.getUserHighestCourseRole(authUser.id, cid);
        
        // Necesita al menos rol de assistant (nivel 50) para acceder al admin del curso
        if (!userCourseRole || userCourseRole.level < CourseRoleUtils.COURSE_ROLE_LEVELS.assistant) {
            throw redirect(303, '/');
        }
    }

    const courseData = await db.select()
        .from(course)
        .where(eq(course.id, cid))
        .limit(1);

    if (!courseData.length) {
        throw error(404, 'course not found');
    }

    const courseFiles = await db.select()
        .from(courseFile)
        .where(eq(courseFile.courseId, cid))
        .all();

    const interactives = await db
        .select({
            id: interactiveLearning.id,
            name: interactiveLearning.name,
            description: interactiveLearning.description,
            type: interactiveLearning.type,
            status: interactiveLearning.status,
            content: interactiveLearning.content,
            order: courseInteractiveLearning.order
        })
        .from(courseInteractiveLearning)
        .innerJoin(
            interactiveLearning,
            eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
        )
        .where(eq(courseInteractiveLearning.courseId, cid))
        .orderBy(courseInteractiveLearning.order);

    // Obtener estudiantes matriculados usando el nuevo sistema
    const courseUsers = await CourseRoleUtils.getCourseUsers(cid);
    const enrolledStudents = courseUsers
        .filter(u => u.role === 'student')
        .map(u => ({
            id: u.userId,
            username: u.username,
            email: u.email,
            image: u.image,
            role: u.role
        }));

    return {
        course: courseData[0],
        interactives,
        courseFiles,
        enrolledStudents
    };

}) satisfies LayoutServerLoad;
