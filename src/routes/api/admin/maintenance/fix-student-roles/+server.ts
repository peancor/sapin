import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { courseRole, user, role, userRoleAssignment } from '$lib/server/db/schema';
import { eq, and, isNull, or, gt, inArray } from 'drizzle-orm';
import { ROLE_LEVELS, ROLE_NAMES } from '$lib/server/roles';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.user.highestRoleLevel < ROLE_LEVELS.SUPER_ADMIN)
		return new Response('Forbidden', { status: 403 });

	const body = await request.json().catch(() => null);
	const mode = body?.mode;
	if (mode !== 'preview' && mode !== 'execute')
		return json({ error: 'Parámetro "mode" inválido. Use "preview" o "execute".' }, { status: 400 });

	// 1. Obtener distinct userIds enrolados como estudiantes en algún curso (activos)
	const courseStudents = await db
		.selectDistinct({ userId: courseRole.userId })
		.from(courseRole)
		.where(and(eq(courseRole.role, 'student'), eq(courseRole.isActive, true)))
		.all();

	if (courseStudents.length === 0) {
		if (mode === 'preview') return json({ users: [] });
		return json({ assigned: 0, skipped: 0, errors: 0 });
	}

	const allCourseStudentIds = courseStudents.map((r) => r.userId);

	// 2. De esos usuarios, encontrar cuáles ya tienen al menos un rol de sistema activo.
	// Cualquier rol de sistema tiene nivel >= STUDENT (10), así que cualquier rol activo
	// es suficiente. Los que NO aparezcan son los candidatos.
	const now = new Date();
	const usersWithSufficientRole = await db
		.selectDistinct({ userId: userRoleAssignment.userId })
		.from(userRoleAssignment)
		.innerJoin(
			role,
			and(eq(userRoleAssignment.roleId, role.id), eq(role.isActive, true))
		)
		.where(
			and(
				inArray(userRoleAssignment.userId, allCourseStudentIds),
				eq(userRoleAssignment.isActive, true),
				or(isNull(userRoleAssignment.expiresAt), gt(userRoleAssignment.expiresAt, now))
			)
		)
		.all();

	const coveredIds = new Set(usersWithSufficientRole.map((r) => r.userId));
	const candidateIds = allCourseStudentIds.filter((id) => !coveredIds.has(id));

	if (candidateIds.length === 0) {
		if (mode === 'preview') return json({ users: [] });
		return json({ assigned: 0, skipped: 0, errors: 0 });
	}

	// 3. Obtener datos de los candidatos para mostrar/operar
	const candidates = await db
		.select({ id: user.id, username: user.username, email: user.email })
		.from(user)
		.where(inArray(user.id, candidateIds))
		.all();

	if (mode === 'preview') {
		return json({ users: candidates });
	}

	// --- mode === 'execute' ---

	// Obtener el rol de sistema 'student'
	const studentRole = await db
		.select()
		.from(role)
		.where(and(eq(role.name, ROLE_NAMES.STUDENT), eq(role.isActive, true)))
		.get();

	if (!studentRole) {
		return json(
			{ error: 'No se encontró el rol de sistema "student" en la base de datos.' },
			{ status: 500 }
		);
	}

	let assigned = 0;
	let skipped = 0;
	let errors = 0;

	for (const candidate of candidates) {
		try {
			// Verificar de nuevo (evitar race conditions) si ya tiene este rol exacto
			const existing = await db
				.select()
				.from(userRoleAssignment)
				.where(
					and(
						eq(userRoleAssignment.userId, candidate.id),
						eq(userRoleAssignment.roleId, studentRole.id),
						eq(userRoleAssignment.isActive, true)
					)
				)
				.get();

			if (existing) {
				skipped++;
				continue;
			}

			const now2 = new Date();
			await db.insert(userRoleAssignment).values({
				id: nanoid(),
				userId: candidate.id,
				roleId: studentRole.id,
				assignedBy: locals.user.id,
				assignedAt: now2,
				expiresAt: null,
				reason: 'Asignación automática por script de mantenimiento: fix-student-roles',
				isActive: true
			});

			assigned++;
		} catch {
			errors++;
		}
	}

	return json({ assigned, skipped, errors });
};
