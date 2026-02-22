import type { PageServerLoad, Actions } from './$types';
import { db, CourseRoleUtils, RoleUtils } from '$lib/server/db';
import { user, role, userRoleAssignment } from '$lib/server/db/schema';
import { eq, and, not, inArray, isNull, or, gt, gte } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { ROLE_LEVELS } from '$lib/server/roles';

export const load = (async ({ parent, params }) => {
    const parentData = await parent();

    // Get users with teacher-level roles to show as available teachers
    const now = new Date();
    const teacherAssignments = await db.select({
        userId: userRoleAssignment.userId
    })
    .from(userRoleAssignment)
    .innerJoin(role, eq(userRoleAssignment.roleId, role.id))
    .where(
        and(
            eq(userRoleAssignment.isActive, true),
            eq(role.isActive, true),
            gte(role.level, ROLE_LEVELS.TEACHER),
            or(
                isNull(userRoleAssignment.expiresAt),
                gt(userRoleAssignment.expiresAt, now)
            )
        )
    );

    const teacherUserIds = [...new Set(teacherAssignments.map(a => a.userId))];
    const currentTeacherIds = parentData.teachers.map(t => t.id);
    const availableTeacherIds = teacherUserIds.filter(id => !currentTeacherIds.includes(id));

    const availableTeachers = availableTeacherIds.length > 0
        ? await db.select().from(user).where(inArray(user.id, availableTeacherIds))
        : [];

    return {
        ...parentData,
        availableTeachers,
        courseId: params.cid
    };
}) satisfies PageServerLoad;

export const actions = {
    addTeachers: async ({ request, params }) => {
        const formData = await request.formData();
        const teacherIdsJson = formData.get('teacherIds') as string;

        if (!teacherIdsJson) {
            return fail(400, { error: 'No se han seleccionado profesores' });
        }

        let teacherIds: string[];
        try {
            teacherIds = JSON.parse(teacherIdsJson);
            if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
                return fail(400, { error: 'No se han seleccionado profesores' });
            }
        } catch {
            return fail(400, { error: 'Formato de datos inválido' });
        }

        try {
            let successCount = 0;
            for (const teacherId of teacherIds) {
                const result = await CourseRoleUtils.assignCourseRole(params.cid, teacherId, 'teacher');
                if (result.success) successCount++;
            }

            return { success: true, message: `${successCount} profesor(es) añadido(s) correctamente` };
        } catch (error) {
            console.error('Error adding teachers:', error);
            return fail(500, { error: 'Error al añadir profesores' });
        }
    },

    removeTeacher: async ({ request, params }) => {
        const formData = await request.formData();
        const teacherId = formData.get('teacherId') as string;

        if (!teacherId) {
            return fail(400, { error: 'No se ha especificado el profesor' });
        }

        try {
            const result = await CourseRoleUtils.revokeCourseRole(params.cid, teacherId, 'teacher');

            if (!result.success) {
                return fail(400, { error: result.error || 'Error al eliminar profesor' });
            }

            return { success: true, message: 'Profesor eliminado correctamente' };
        } catch (error) {
            console.error('Error removing teacher:', error);
            return fail(500, { error: 'Error al eliminar profesor' });
        }
    },

    removeTeachersBulk: async ({ request, params }) => {
        const formData = await request.formData();
        const teacherIdsJson = formData.get('teacherIds') as string;

        if (!teacherIdsJson) {
            return fail(400, { error: 'No se han seleccionado profesores' });
        }

        let teacherIds: string[];
        try {
            teacherIds = JSON.parse(teacherIdsJson);
            if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
                return fail(400, { error: 'No se han seleccionado profesores' });
            }
        } catch {
            return fail(400, { error: 'Formato de datos inválido' });
        }

        try {
            let successCount = 0;
            for (const teacherId of teacherIds) {
                const result = await CourseRoleUtils.revokeCourseRole(params.cid, teacherId, 'teacher');
                if (result.success) successCount++;
            }

            return { success: true, message: `${successCount} profesor(es) eliminado(s) correctamente` };
        } catch (error) {
            console.error('Error removing teachers:', error);
            return fail(500, { error: 'Error al eliminar profesores' });
        }
    }
} satisfies Actions;
