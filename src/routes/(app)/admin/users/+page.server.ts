import { db } from '$lib/server/db';
import { user, role, userRoleAssignment } from '$lib/server/db/schema';
import { eq, like, or, count, desc, and, isNull, gt, exists, type SQL } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { DBUserUtils } from '$lib/server/db';
import { assignRoleToUser, canManageUserRoles, getAssignableRoles } from '$lib/server/db/RoleUtils';
import { auditService, auditAction } from '$lib/server/logging';

function getClientIP(request: Request): string | null {
	return (
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		null
	);
}

const ITEMS_PER_PAGE = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 255;
const MAX_USERNAME_LENGTH = 64;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AddUserValues = { email: string; username: string; roleId: string };

function isUniqueConstraintError(error: unknown, column: string): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes('UNIQUE constraint failed') && message.includes(column);
}

function activeAssignmentFor(userId: string | typeof user.id, roleName?: string) {
	const now = new Date();
	const conditions = [
		typeof userId === 'string'
			? eq(userRoleAssignment.userId, userId)
			: eq(userRoleAssignment.userId, userId),
		eq(userRoleAssignment.isActive, true),
		or(isNull(userRoleAssignment.expiresAt), gt(userRoleAssignment.expiresAt, now))
	];
	if (roleName) conditions.push(eq(role.name, roleName));
	return and(...conditions);
}

export const load = (async ({ url, locals }) => {
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1);
	const search = url.searchParams.get('search')?.trim() || '';
	const roleFilter = url.searchParams.get('role') || 'all';

	// Roles que el usuario actual puede asignar (según su nivel)
	const availableRoles = locals.user ? await getAssignableRoles(locals.user.id) : [];

	// Búsqueda y filtro de rol en SQL para que la paginación sea coherente
	const whereConditions: SQL[] = [];
	if (search) {
		const searchCondition = or(like(user.username, `%${search}%`), like(user.email, `%${search}%`));
		if (searchCondition) whereConditions.push(searchCondition);
	}
	if (roleFilter !== 'all') {
		const roleCondition = activeAssignmentFor(user.id, roleFilter);
		if (roleCondition) {
			whereConditions.push(
				exists(
					db
						.select({ id: userRoleAssignment.id })
						.from(userRoleAssignment)
						.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
						.where(roleCondition)
				)
			);
		}
	}
	const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

	const totalResult = await db.select({ count: count() }).from(user).where(where);
	const totalUsers = totalResult[0]?.count ?? 0;
	const totalPages = Math.ceil(totalUsers / ITEMS_PER_PAGE);

	const usersData = await db
		.select({
			id: user.id,
			email: user.email,
			username: user.username,
			createdAt: user.createdAt,
			image: user.image
		})
		.from(user)
		.where(where)
		.orderBy(desc(user.createdAt))
		.limit(ITEMS_PER_PAGE)
		.offset((page - 1) * ITEMS_PER_PAGE);

	const users = await Promise.all(
		usersData.map(async (u) => {
			const userRoles = await db
				.select({
					id: role.id,
					name: role.name,
					displayName: role.displayName,
					level: role.level
				})
				.from(userRoleAssignment)
				.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
				.where(activeAssignmentFor(u.id))
				.all();

			return {
				...u,
				roles: userRoles.toSorted((a, b) => b.level - a.level)
			};
		})
	);

	return {
		users,
		currentUserId: locals.user?.id ?? null,
		availableRoles: availableRoles
			.map(({ id, name, displayName, level, description }) => ({
				id,
				name,
				displayName,
				level,
				description
			}))
			.toSorted((a, b) => b.level - a.level),
		pagination: {
			page,
			totalPages,
			totalUsers,
			itemsPerPage: ITEMS_PER_PAGE
		},
		filters: {
			search,
			role: roleFilter
		}
	};
}) satisfies PageServerLoad;

export const actions = {
	addUser: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'No autenticado' });

		const data = await request.formData();
		const values: AddUserValues = {
			email: data.get('email')?.toString().trim().toLowerCase() ?? '',
			username: data.get('username')?.toString().trim() ?? '',
			roleId: data.get('roleId')?.toString() ?? ''
		};
		const password = data.get('password')?.toString() ?? '';

		if (!EMAIL_PATTERN.test(values.email)) {
			return fail(400, { values, field: 'email', message: 'Introduce un email válido.' });
		}
		if (!values.username || values.username.length > MAX_USERNAME_LENGTH) {
			return fail(400, {
				values,
				field: 'username',
				message: `El nombre de usuario es obligatorio (máximo ${MAX_USERNAME_LENGTH} caracteres).`
			});
		}
		if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
			return fail(400, {
				values,
				field: 'password',
				message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
			});
		}

		// El rol debe estar entre los que el administrador actual puede asignar
		const assignableRoles = await getAssignableRoles(locals.user.id);
		const targetRole = assignableRoles.find((r) => r.id === values.roleId);
		if (!targetRole) {
			return fail(400, { values, field: 'roleId', message: 'Selecciona un rol válido.' });
		}

		let userId: string;
		try {
			userId = await DBUserUtils.registerUser({
				username: values.username,
				email: values.email,
				password
			});
		} catch (error) {
			if (isUniqueConstraintError(error, 'user.email')) {
				return fail(409, {
					values,
					field: 'email',
					message: 'Ya existe un usuario con ese email.'
				});
			}
			if (isUniqueConstraintError(error, 'user.username')) {
				return fail(409, {
					values,
					field: 'username',
					message: 'Ese nombre de usuario ya está en uso.'
				});
			}
			console.error('Error creating user:', error);
			return fail(500, { values, message: 'No se pudo crear el usuario. Inténtalo de nuevo.' });
		}

		try {
			await assignRoleToUser(
				userId,
				targetRole.id,
				locals.user.id,
				'Asignado durante la creación del usuario'
			);
		} catch (roleError) {
			// Sin rol el usuario no debe quedar creado a medias
			console.error('Error assigning role to new user:', roleError);
			await DBUserUtils.deleteUser(userId);
			return fail(500, {
				values,
				message: 'No se pudo asignar el rol. El usuario no se ha creado.'
			});
		}

		await auditService.log({
			action: auditAction.USER_CREATED,
			userId: locals.user.id,
			targetType: 'user',
			targetId: userId,
			details: { email: values.email, username: values.username, roleId: targetRole.id },
			ipAddress: getClientIP(request),
			userAgent: request.headers.get('user-agent'),
			severity: 'info'
		});

		return { success: true, message: `Usuario ${values.email} creado correctamente.` };
	},

	deleteUser: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'No autenticado' });

		const data = await request.formData();
		const userId = data.get('userId')?.toString();

		if (!userId) {
			return fail(400, { message: 'Falta el usuario que se quiere eliminar.' });
		}
		if (!(await canManageUserRoles(locals.user.id, userId))) {
			return fail(403, {
				message: 'No puedes eliminar tu propia cuenta ni usuarios de nivel igual o superior.'
			});
		}

		try {
			await DBUserUtils.deleteUser(userId);

			await auditService.log({
				action: auditAction.USER_DELETED,
				userId: locals.user.id,
				targetType: 'user',
				targetId: userId,
				ipAddress: getClientIP(request),
				userAgent: request.headers.get('user-agent'),
				severity: 'warning'
			});

			return { success: true, message: 'Usuario eliminado correctamente.' };
		} catch (error) {
			console.error('Error deleting user:', error);
			return fail(500, { message: 'No se pudo eliminar el usuario.' });
		}
	},

	deleteBulk: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'No autenticado' });

		const data = await request.formData();
		const userIds = [
			...new Set(
				data
					.getAll('userIds')
					.map((value) => value.toString())
					.filter(Boolean)
			)
		];

		if (userIds.length === 0) {
			return fail(400, { message: 'No hay usuarios seleccionados.' });
		}

		const managerId = locals.user.id;
		const permissions = await Promise.all(
			userIds.map((userId) => canManageUserRoles(managerId, userId))
		);
		if (permissions.some((allowed) => !allowed)) {
			return fail(403, {
				message:
					'La selección incluye tu cuenta o usuarios de nivel igual o superior. No se ha eliminado nada.'
			});
		}

		try {
			for (const userId of userIds) {
				await DBUserUtils.deleteUser(userId);
			}

			await auditService.log({
				action: auditAction.USER_DELETED,
				userId: managerId,
				targetType: 'user',
				details: { deletedUserIds: userIds, count: userIds.length },
				ipAddress: getClientIP(request),
				userAgent: request.headers.get('user-agent'),
				severity: 'warning'
			});

			return { success: true, message: `${userIds.length} usuario(s) eliminado(s).` };
		} catch (error) {
			console.error('Error deleting users:', error);
			return fail(500, { message: 'No se pudieron eliminar todos los usuarios.' });
		}
	}
} satisfies Actions;
