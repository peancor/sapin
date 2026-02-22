import type { PageServerLoad, Actions } from './$types';
import { db, InvitationUtils, CourseRoleUtils } from '$lib/server/db';
import { course } from '$lib/server/db/schema';
import { error, fail } from '@sveltejs/kit';
import { createInviteSchema } from '$lib/server/db/InvitationUtils';
import { eq } from 'drizzle-orm';

export const load = (async ({ params, locals }) => {
    const { cid } = params;

    if (!locals.user?.id) throw error(401, 'No autenticado');

    // Verify course exists and user has permission
    const [courseData] = await db
        .select({ id: course.id, name: course.name })
        .from(course)
        .where(eq(course.id, cid));

    if (!courseData) throw error(404, 'Curso no encontrado');

    // Check permission - user must have manageUsers permission in this course
    const hasPermission = await CourseRoleUtils.userHasCoursePermission(
        locals.user.id,
        cid,
        'manageUsers'
    );
    if (!hasPermission && locals.user.highestRoleLevel < 90) {
        throw error(403, 'No tienes permisos para gestionar invitaciones en este curso');
    }

    const [invites, stats] = await Promise.all([
        InvitationUtils.getCourseInvites(cid),
        InvitationUtils.getInviteStats(cid)
    ]);

    return { course: courseData, invites, stats };
}) satisfies PageServerLoad;

export const actions = {
    generate: async ({ request, params, locals }) => {
        if (!locals.user?.id) throw error(401, 'No autenticado');
        const { cid } = params;

        // Verify course
        const [courseData] = await db
            .select({ id: course.id, name: course.name })
            .from(course)
            .where(eq(course.id, cid));

        if (!courseData) throw error(404, 'Curso no encontrado');

        const formData = await request.formData();
        const quantity = parseInt(formData.get('quantity')?.toString() || '1');
        const campaign = formData.get('campaign')?.toString() || undefined;
        const email = formData.get('email')?.toString() || undefined;
        const expiresInDays = parseInt(formData.get('expiresInDays')?.toString() || '30');
        const maxUses = parseInt(formData.get('maxUses')?.toString() || '1');
        const inviteTypeValue = formData.get('inviteType')?.toString() || 'course_student';
        const welcomeMessage = formData.get('welcomeMessage')?.toString();

        let config: any;

        if (inviteTypeValue === 'course_role') {
            const courseRole = formData.get('courseRole')?.toString() || 'student';
            config = {
                type: 'course_role',
                courseId: cid,
                courseRole,
                courseName: courseData.name
            };
        } else {
            config = {
                type: 'course_student' as const,
                courseId: cid,
                courseName: courseData.name
            };
        }

        if (welcomeMessage) config.welcomeMessage = welcomeMessage;

        try {
            const parsed = createInviteSchema.parse({
                quantity,
                campaign,
                email,
                config,
                expiresInDays,
                maxUses
            });

            const codes = await InvitationUtils.createInvites(parsed, locals.user.id);
            return { success: true, codes, count: codes.length };
        } catch (e: any) {
            console.error('Error generating course invites:', e);
            return fail(400, { message: e.message || 'Error al generar invitaciones' });
        }
    },

    deactivate: async ({ request, locals }) => {
        if (!locals.user?.id) throw error(401, 'No autenticado');
        const formData = await request.formData();
        const inviteId = formData.get('inviteId')?.toString();
        if (!inviteId) return fail(400, { message: 'ID de invitación requerido' });

        await InvitationUtils.deactivateInvite(inviteId);
        return { success: true };
    }
} satisfies Actions;
