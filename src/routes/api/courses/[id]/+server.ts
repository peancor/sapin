import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db, CourseRoleUtils } from '$lib/server/db';
import { course } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
    const { id } = params;

    const selectedCourse = await db.select().from(course).where(eq(course.id, id));
    if (!selectedCourse.length) {
        return new Response('Course not found', { status: 404 });
    }

    // Obtener usuarios con roles de teacher o superior usando el nuevo sistema
    const courseUsers = await CourseRoleUtils.getCourseUsers(id);
    const teachers = courseUsers
        .filter(u => ['owner', 'admin', 'teacher'].includes(u.role))
        .map(t => ({
            id: t.userId,
            username: t.username,
            role: t.role
        }));

    return json({
        ...selectedCourse[0],
        teachers
    });
};

export const PUT: RequestHandler = async ({ params, request }) => {
    const { id } = params;
    const { name, description, teacherIds } = await request.json();

    // Actualizar datos del curso
    await db.update(course)
        .set({ name, description })
        .where(eq(course.id, id));

    // Obtener teachers actuales
    const currentUsers = await CourseRoleUtils.getCourseUsers(id);
    const currentTeacherIds = currentUsers
        .filter(u => u.role === 'teacher')
        .map(u => u.userId);

    // Revocar teachers que ya no están en la lista
    for (const teacherId of currentTeacherIds) {
        if (!teacherIds?.includes(teacherId)) {
            await CourseRoleUtils.revokeCourseRole(id, teacherId, 'teacher');
        }
    }

    // Añadir nuevos teachers
    if (teacherIds?.length > 0) {
        for (const teacherId of teacherIds) {
            if (!currentTeacherIds.includes(teacherId)) {
                await CourseRoleUtils.assignCourseRole(id, teacherId, 'teacher');
            }
        }
    }

    return json({ success: true });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
    const { id } = params;
    const { teacherIdsToAdd, teacherIdsToRemove, studentIdsToAdd, studentIdsToRemove } = await request.json();

    // Añadir teachers
    if (teacherIdsToAdd?.length) {
        for (const tid of teacherIdsToAdd) {
            await CourseRoleUtils.assignCourseRole(id, tid, 'teacher');
        }
    }

    // Remover teachers
    if (teacherIdsToRemove?.length) {
        for (const tid of teacherIdsToRemove) {
            await CourseRoleUtils.revokeCourseRole(id, tid, 'teacher');
        }
    }

    // Añadir estudiantes
    if (studentIdsToAdd?.length) {
        for (const sid of studentIdsToAdd) {
            await CourseRoleUtils.assignCourseRole(id, sid, 'student');
        }
    }

    // Remover estudiantes
    if (studentIdsToRemove?.length) {
        for (const sid of studentIdsToRemove) {
            await CourseRoleUtils.revokeCourseRole(id, sid, 'student');
        }
    }

    return json({ success: true });
};