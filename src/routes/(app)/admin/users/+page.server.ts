import { db } from '$lib/server/db';
import { user, role, userRoleAssignment } from '$lib/server/db/schema';
import { eq, like, or, count, desc, and, isNull, gt } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { DBUserUtils } from '$lib/server/db';
import { getAllRoles, assignRoleToUser, getAssignableRoles } from '$lib/server/db/RoleUtils';
import { auditService, auditAction } from '$lib/server/logging';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
}

const ITEMS_PER_PAGE = 10;

export const load = (async ({ url, locals }) => {
    const page = Number(url.searchParams.get('page')) || 1;
    const search = url.searchParams.get('search') || '';
    const roleFilter = url.searchParams.get('role') || 'all';
    
    // Cargar roles disponibles para asignar (según el nivel del usuario actual)
    const currentUserId = locals.user?.id;
    const availableRoles = currentUserId 
        ? await getAssignableRoles(currentUserId)
        : await getAllRoles();
    
    // Build where conditions for search only
    const whereConditions = [];
    
    if (search) {
        whereConditions.push(
            or(
                like(user.username, `%${search}%`),
                like(user.email, `%${search}%`)
            )
        );
    }
    
    // Get total count for pagination
    const totalCountQuery = db.select({ count: count() }).from(user);
    if (whereConditions.length > 0) {
        whereConditions.forEach(condition => {
            if (condition) totalCountQuery.where(condition);
        });
    }
    const totalResult = await totalCountQuery;
    const totalUsers = totalResult[0]?.count ?? 0;
    const totalPages = Math.ceil(totalUsers / ITEMS_PER_PAGE);
    
    // Get paginated users
    const usersQuery = db
        .select({
            id: user.id,
            email: user.email,
            username: user.username,
            createdAt: user.createdAt,
            image: user.image
        })
        .from(user);
    
    if (whereConditions.length > 0) {
        whereConditions.forEach(condition => {
            if (condition) usersQuery.where(condition);
        });
    }
    
    const usersData = await usersQuery
        .orderBy(desc(user.createdAt))
        .limit(ITEMS_PER_PAGE)
        .offset((page - 1) * ITEMS_PER_PAGE);

    // Cargar roles del nuevo sistema para cada usuario
    const now = new Date();
    const usersWithRoles = await Promise.all(
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
                .where(
                    and(
                        eq(userRoleAssignment.userId, u.id),
                        eq(userRoleAssignment.isActive, true),
                        or(
                            isNull(userRoleAssignment.expiresAt),
                            gt(userRoleAssignment.expiresAt, now)
                        )
                    )
                )
                .all();
            
            return {
                ...u,
                roles: userRoles
            };
        })
    );

    // Filtrar por rol si se especificó (post-filtrado basado en nuevo sistema)
    let filteredUsers = usersWithRoles;
    if (roleFilter && roleFilter !== 'all') {
        filteredUsers = usersWithRoles.filter(u => 
            u.roles.some(r => r.name === roleFilter)
        );
    }

    return {
        users: filteredUsers,
        availableRoles,
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
        const data = await request.formData();
        const email = data.get('email')?.toString();
        const username = data.get('username')?.toString();
        const password = data.get('password')?.toString();
        const roleId = data.get('roleId')?.toString();

        if (!email || !password) {
            return fail(400, { message: 'Email y contraseña son requeridos' });
        }

        try {
            // Crear usuario
            const userId = await DBUserUtils.registerUser({
                username,
                email,
                password
            });

            // Asignar rol del nuevo sistema (o rol 'user' por defecto)
            const targetRoleId = roleId || 'role_user';
            try {
                await assignRoleToUser(
                    userId,
                    targetRoleId,
                    locals.user?.id,
                    'Asignado durante la creación del usuario'
                );
            } catch (roleError) {
                console.warn('No se pudo asignar el rol:', roleError);
            }

            // Audit log
            await auditService.log({
                action: auditAction.USER_CREATED,
                userId: locals.user?.id,
                targetType: 'user',
                targetId: userId,
                details: { email, username, roleId: targetRoleId },
                ipAddress: getClientIP(request),
                userAgent: request.headers.get('user-agent'),
                severity: 'info'
            });

            return { success: true };
        } catch (error) {
            console.error('Error creating user:', error);
            return fail(500, { message: 'Error al crear el usuario' });
        }
    },

    deleteUser: async ({ request, locals }) => {
        const data = await request.formData();
        const userId = data.get('userId')?.toString();

        if (!userId) {
            return fail(400, { message: 'User ID is required' });
        }

        try {
            await DBUserUtils.deleteUser(userId);

            // Audit log
            await auditService.log({
                action: auditAction.USER_DELETED,
                userId: locals.user?.id,
                targetType: 'user',
                targetId: userId,
                ipAddress: getClientIP(request),
                userAgent: request.headers.get('user-agent'),
                severity: 'warning'
            });

            return { success: true, message: 'User deleted successfully' };
        } catch (error) {
            console.error('Error deleting user:', error);
            return fail(500, { message: 'Error deleting user' });
        }
    },

    deleteBulk: async ({ request, locals }) => {
        const data = await request.formData();
        const userIdsString = data.get('userIds')?.toString();

        if (!userIdsString) {
            return fail(400, { message: 'No users selected' });
        }

        try {
            const userIds = JSON.parse(userIdsString);
            for (const userId of userIds) {
                await DBUserUtils.deleteUser(userId);
            }

            // Audit log
            await auditService.log({
                action: auditAction.USER_DELETED,
                userId: locals.user?.id,
                targetType: 'user',
                details: { deletedUserIds: userIds, count: userIds.length },
                ipAddress: getClientIP(request),
                userAgent: request.headers.get('user-agent'),
                severity: 'warning'
            });

            return { success: true, message: `${userIds.length} users deleted successfully` };
        } catch (error) {
            console.error('Error deleting user:', error);
            return fail(500, { message: 'Error deleting user' });
        }
    }
} satisfies Actions;