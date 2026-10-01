import type { PageServerLoad, Actions } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { not, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { ROLE_LEVELS } from '$lib/server/roles';

function requireAdmin(locals: App.Locals) {
    if (!locals.user) {
        throw error(401, 'No autenticado');
    }

    if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) {
        throw error(403, 'No autorizado');
    }
}

export const load = (async ({ parent, params }) => {
    const parentData = await parent();

    // Get all users not already in the course
    const allCourseUserIds = [...parentData.teachers.map(t => t.id), ...parentData.students.map(s => s.id)];

    const availableStudents = allCourseUserIds.length > 0
        ? await db.select().from(user).where(not(inArray(user.id, allCourseUserIds)))
        : await db.select().from(user);

    return {
        ...parentData,
        availableStudents,
        courseId: params.cid
    };
}) satisfies PageServerLoad;

export const actions = {
    addStudents: async ({ request, params, locals }) => {
        requireAdmin(locals);
        const formData = await request.formData();
        const studentIdsJson = formData.get('studentIds') as string;

        if (!studentIdsJson) {
            return fail(400, { error: 'No se han seleccionado estudiantes' });
        }

        let studentIds: string[];
        try {
            studentIds = JSON.parse(studentIdsJson);
            if (!Array.isArray(studentIds) || studentIds.length === 0) {
                return fail(400, { error: 'No se han seleccionado estudiantes' });
            }
        } catch {
            return fail(400, { error: 'Formato de datos inválido' });
        }

        try {
            let successCount = 0;
            for (const studentId of studentIds) {
                const result = await CourseRoleUtils.assignCourseRole(params.cid, studentId, 'student');
                if (result.success) successCount++;
            }

            return { success: true, message: `${successCount} estudiante(s) inscrito(s) correctamente` };
        } catch (error) {
            console.error('Error adding students:', error);
            return fail(500, { error: 'Error al inscribir estudiantes' });
        }
    },

    removeStudent: async ({ request, params, locals }) => {
        requireAdmin(locals);
        const formData = await request.formData();
        const studentId = formData.get('studentId') as string;

        if (!studentId) {
            return fail(400, { error: 'No se ha especificado el estudiante' });
        }

        try {
            const result = await CourseRoleUtils.revokeCourseRole(params.cid, studentId, 'student');

            if (!result.success) {
                return fail(400, { error: result.error || 'Error al dar de baja al estudiante' });
            }

            return { success: true, message: 'Estudiante dado de baja correctamente' };
        } catch (error) {
            console.error('Error removing student:', error);
            return fail(500, { error: 'Error al dar de baja al estudiante' });
        }
    },

    removeStudentsBulk: async ({ request, params, locals }) => {
        requireAdmin(locals);
        const formData = await request.formData();
        const studentIdsJson = formData.get('studentIds') as string;

        if (!studentIdsJson) {
            return fail(400, { error: 'No se han seleccionado estudiantes' });
        }

        let studentIds: string[];
        try {
            studentIds = JSON.parse(studentIdsJson);
            if (!Array.isArray(studentIds) || studentIds.length === 0) {
                return fail(400, { error: 'No se han seleccionado estudiantes' });
            }
        } catch {
            return fail(400, { error: 'Formato de datos inválido' });
        }

        try {
            let successCount = 0;
            for (const studentId of studentIds) {
                const result = await CourseRoleUtils.revokeCourseRole(params.cid, studentId, 'student');
                if (result.success) successCount++;
            }

            return { success: true, message: `${successCount} estudiante(s) dado(s) de baja correctamente` };
        } catch (error) {
            console.error('Error removing students:', error);
            return fail(500, { error: 'Error al dar de baja a los estudiantes' });
        }
    }
} satisfies Actions;
