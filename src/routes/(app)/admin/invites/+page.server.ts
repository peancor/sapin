import type { PageServerLoad, Actions } from './$types';
import { db, RoleUtils, InvitationUtils } from '$lib/server/db';
import { course } from '$lib/server/db/schema';
import { error, fail } from '@sveltejs/kit';
import { createInviteSchema, inviteConfigSchema } from '$lib/server/db/InvitationUtils';
import { eq } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';

export const load = (async ({ locals }) => {
    if (!locals.user?.id) throw error(401, 'No autenticado');

    const [invites, stats, courses, allRoles] = await Promise.all([
        InvitationUtils.getAllInvites(),
        InvitationUtils.getInviteStats(),
        db.select({ id: course.id, name: course.name }).from(course).all(),
        RoleUtils.getAllRoles()
    ]);

    const roles = allRoles.filter((r) => r.level < ROLE_LEVELS.ADMIN);

    return { invites, stats, courses, roles };
}) satisfies PageServerLoad;

export const actions = {
    generate: async ({ request, locals }) => {
        if (!locals.user?.id) throw error(401, 'No autenticado');

        const formData = await request.formData();
        const quantity = parseInt(formData.get('quantity')?.toString() || '1');
        const campaign = formData.get('campaign')?.toString() || undefined;
        const email = formData.get('email')?.toString() || undefined;
        const expiresInDays = parseInt(formData.get('expiresInDays')?.toString() || '30');
        const maxUses = parseInt(formData.get('maxUses')?.toString() || '1');
        const inviteTypeValue = formData.get('inviteType')?.toString();

        // Build config based on type
        let config: any;
        switch (inviteTypeValue) {
            case 'course_student': {
                const courseId = formData.get('courseId')?.toString();
                if (!courseId) return fail(400, { message: 'Debe seleccionar un curso' });
                // Get course name for snapshot
                const [c] = await db.select({ name: course.name }).from(course).where(eq(course.id, courseId));
                config = { type: 'course_student', courseId, courseName: c?.name };
                break;
            }
            case 'course_teacher': {
                const courseId = formData.get('courseId')?.toString();
                if (!courseId) return fail(400, { message: 'Debe seleccionar un curso' });
                const [c] = await db.select({ name: course.name }).from(course).where(eq(course.id, courseId));
                config = { type: 'course_teacher', courseId, courseName: c?.name };
                break;
            }
            case 'system_role': {
                const systemRoleId = formData.get('systemRoleId')?.toString();
                if (!systemRoleId) return fail(400, { message: 'Debe seleccionar un rol de sistema' });

                const selectedRole = (await RoleUtils.getAllRoles()).find((r) => r.id === systemRoleId);
                if (!selectedRole) return fail(400, { message: 'Rol de sistema inválido' });
                if (selectedRole.level >= ROLE_LEVELS.ADMIN) {
                    return fail(400, { message: 'No se permite generar invitaciones para roles de administración' });
                }

                config = { type: 'system_role', systemRoleId };
                break;
            }
            case 'generic_student': {
                config = { type: 'generic_student' };
                break;
            }
            case 'open_registration': {
                config = { type: 'open_registration' };
                break;
            }
            default:
                return fail(400, { message: 'Tipo de invitación inválido' });
        }

        const welcomeMessage = formData.get('welcomeMessage')?.toString();
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
            console.error('Error generating invites:', e);
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
