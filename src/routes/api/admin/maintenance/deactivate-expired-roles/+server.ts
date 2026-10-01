import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userRoleAssignment, role, user } from '$lib/server/db/schema';
import { eq, and, lt, isNotNull } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.user.highestRoleLevel < ROLE_LEVELS.SUPER_ADMIN)
		return new Response('Forbidden', { status: 403 });

	const body = await request.json().catch(() => null);
	const mode = body?.mode;
	if (mode !== 'preview' && mode !== 'execute')
		return json({ error: 'Parámetro "mode" inválido.' }, { status: 400 });

	const now = new Date();

	// Asignaciones activas cuya fecha de expiración ya ha pasado
	const expired = await db
		.select({
			id: userRoleAssignment.id,
			userId: userRoleAssignment.userId,
			username: user.username,
			email: user.email,
			roleName: role.displayName
		})
		.from(userRoleAssignment)
		.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
		.innerJoin(user, eq(userRoleAssignment.userId, user.id))
		.where(
			and(
				eq(userRoleAssignment.isActive, true),
				isNotNull(userRoleAssignment.expiresAt),
				lt(userRoleAssignment.expiresAt, now)
			)
		)
		.all();

	if (mode === 'preview') {
		return json({
			assignments: expired.map((a) => ({
				username: a.username,
				email: a.email,
				roleName: a.roleName
			}))
		});
	}

	// Desactivar todas las expiradas
	let deactivated = 0;
	for (const a of expired) {
		await db
			.update(userRoleAssignment)
			.set({ isActive: false })
			.where(eq(userRoleAssignment.id, a.id));
		deactivated++;
	}

	return json({ deactivated });
};
