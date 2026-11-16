import type { PageServerLoad, Actions } from './$types';
import { db, InvitationUtils, CourseRoleUtils } from '$lib/server/db';
import { course, invite } from '$lib/server/db/schema';
import { error, fail } from '@sveltejs/kit';
import { createInviteSchema } from '$lib/server/db/InvitationUtils';
import { ROLE_LEVELS } from '$lib/server/roles';
import { and, eq } from 'drizzle-orm';

type CourseRoleName = keyof typeof CourseRoleUtils.COURSE_ROLE_LEVELS;

function isCourseRoleName(value: string): value is CourseRoleName {
	return Object.hasOwn(CourseRoleUtils.COURSE_ROLE_LEVELS, value);
}

/**
 * Comprueba que el usuario puede gestionar invitaciones en el curso y devuelve
 * el nivel de rol de curso máximo que puede conceder. Un admin de sistema puede
 * conceder cualquier rol; el resto, como mucho su propio nivel de rol en el curso.
 * Las escalas de rol de sistema y de curso son distintas y no se comparan entre sí.
 */
async function requireInviteManager(
	cid: string,
	user: { id: string; highestRoleLevel: number } | null | undefined
): Promise<number> {
	if (!user?.id) throw error(401, 'No autenticado');

	if (user.highestRoleLevel >= ROLE_LEVELS.ADMIN) {
		return CourseRoleUtils.COURSE_ROLE_LEVELS.owner;
	}

	const hasPermission = await CourseRoleUtils.userHasCoursePermission(user.id, cid, 'manageUsers');
	if (!hasPermission) {
		throw error(403, 'No tienes permisos para gestionar invitaciones en este curso');
	}

	const highestRole = await CourseRoleUtils.getUserHighestCourseRole(user.id, cid);
	if (!highestRole) {
		throw error(403, 'No tienes permisos para gestionar invitaciones en este curso');
	}
	return highestRole.level;
}

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
	const maxCourseRoleLevel = await requireInviteManager(cid, locals.user);

	const [invites, stats] = await Promise.all([
		InvitationUtils.getCourseInvites(cid),
		InvitationUtils.getInviteStats(cid)
	]);

	return { course: courseData, invites, stats, maxCourseRoleLevel };
}) satisfies PageServerLoad;

export const actions = {
	generate: async ({ request, params, locals }) => {
		if (!locals.user?.id) throw error(401, 'No autenticado');
		const { cid } = params;
		const maxCourseRoleLevel = await requireInviteManager(cid, locals.user);

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

		let config: Record<string, unknown>;

		if (inviteTypeValue === 'course_role') {
			const courseRole = formData.get('courseRole')?.toString() || 'student';
			if (!isCourseRoleName(courseRole)) {
				return fail(400, { message: 'Rol de curso no válido' });
			}
			if (CourseRoleUtils.COURSE_ROLE_LEVELS[courseRole] > maxCourseRoleLevel) {
				return fail(403, {
					message: 'No puedes generar invitaciones con un rol superior al tuyo en el curso'
				});
			}
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
		} catch (e) {
			console.error('Error generating course invites:', e);
			return fail(400, {
				message: e instanceof Error && e.message ? e.message : 'Error al generar invitaciones'
			});
		}
	},

	deactivate: async ({ request, params, locals }) => {
		await requireInviteManager(params.cid, locals.user);
		const formData = await request.formData();
		const inviteId = formData.get('inviteId')?.toString();
		if (!inviteId) return fail(400, { message: 'ID de invitación requerido' });

		const [target] = await db
			.select({ id: invite.id })
			.from(invite)
			.where(and(eq(invite.id, inviteId), eq(invite.courseId, params.cid)));
		if (!target) return fail(404, { message: 'Invitación no encontrada en este curso' });

		await InvitationUtils.deactivateInvite(target.id);
		return { success: true };
	}
} satisfies Actions;
