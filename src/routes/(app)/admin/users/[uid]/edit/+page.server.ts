import { db, DBUserUtils, RoleUtils } from '$lib/server/db';
import { user, role, userRoleAssignment } from '$lib/server/db/schema';
import { eq, and, or, isNull, gt } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { nanoid } from 'nanoid';
import * as path from 'path';

const AVATAR_DIR = 'static/uploads/avatars';

async function ensureDir(dir: string) {
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
}

async function saveAvatar(file: File): Promise<string> {
    await ensureDir(AVATAR_DIR);
    
    const filename = `${nanoid()}.${file.name.split('.').pop()}`;
    const filepath = path.join(AVATAR_DIR, filename);
    
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(arrayBuffer));
    
    return `/uploads/avatars/${filename}`;
}

export const load = (async ({ params, locals }) => {
    const users = await db
        .select({
            id: user.id,
            email: user.email,
            username: user.username,
            image: user.image
        })
        .from(user)
        .where(eq(user.id, params.uid));

    if (users.length === 0) {
        throw error(404, 'Usuario no encontrado');
    }

    // Cargar roles que el usuario actual puede asignar (según su nivel)
    const currentUserId = locals.user?.id;
    const availableRoles = currentUserId 
        ? await RoleUtils.getAssignableRoles(currentUserId)
        : [];

    // Cargar roles asignados al usuario
    const now = new Date();
    const assignedRoles = await db
        .select({
            role: role,
            assignment: userRoleAssignment
        })
        .from(userRoleAssignment)
        .innerJoin(role, eq(userRoleAssignment.roleId, role.id))
        .where(
            and(
                eq(userRoleAssignment.userId, params.uid),
                eq(userRoleAssignment.isActive, true),
                or(
                    isNull(userRoleAssignment.expiresAt),
                    gt(userRoleAssignment.expiresAt, now)
                )
            )
        )
        .all();

    // IDs de roles asignados
    const assignedRoleIds = assignedRoles.map(r => r.role.id);

    // Verificar si el usuario actual puede gestionar roles de este usuario
    const canManageRoles = locals.user ? 
        await RoleUtils.canManageUserRoles(locals.user.id, params.uid) : false;

    return {
        user: users[0],
        availableRoles,
        assignedRoleIds,
        canManageRoles
    };
}) satisfies PageServerLoad;

export const actions = {
    updateUser: async ({ request, params }) => {
        const data = await request.formData();
        const email = data.get('email')?.toString();
        const username = data.get('username')?.toString();
        const password = data.get('password')?.toString();

        if (!email) {
            return fail(400, { message: 'Faltan campos requeridos' });
        }

        try {
            const updateData: any = {
                email,
                username: username || null,
                updatedAt: new Date()
            };

            // Manejar eliminación de imagen
            const removeImage = data.get('removeImage')?.toString() === 'true';
            if (removeImage) {
                updateData.image = null;
            }

            // Manejar subida de nueva imagen (tiene prioridad sobre eliminar)
            const avatarFile = data.get('avatar') as File;
            if (avatarFile instanceof File && avatarFile.size > 0) {
                try {
                    updateData.image = await saveAvatar(avatarFile);
                } catch (error) {
                    console.error('Error saving avatar:', error);
                    return fail(500, { message: 'Error saving avatar' });
                }
            }

            await db
                .update(user)
                .set(updateData)
                .where(eq(user.id, params.uid));

            // Cambiar contraseña si se proporcionó
            if (password) {
                await DBUserUtils.changePassword(params.uid, password);
            }

            return { success: true };
        } catch (e) {
            console.error('Error actualizando usuario:', e);
            return fail(500, { message: 'Error actualizando usuario' });
        }
    },

    updateRoles: async ({ request, params, locals }) => {
        if (!locals.user) {
            return fail(401, { message: 'No autenticado' });
        }

        // Verificar permisos
        const canManage = await RoleUtils.canManageUserRoles(locals.user.id, params.uid);
        if (!canManage) {
            return fail(403, { message: 'No tienes permisos para gestionar roles de este usuario' });
        }

        const data = await request.formData();
        const selectedRolesJson = data.get('selectedRoles')?.toString();
        
        if (!selectedRolesJson) {
            return fail(400, { message: 'No se proporcionaron roles' });
        }

        try {
            const selectedRoleIds: string[] = JSON.parse(selectedRolesJson);
            
            // Obtener roles actuales del usuario
            const now = new Date();
            const currentAssignments = await db
                .select({ roleId: userRoleAssignment.roleId })
                .from(userRoleAssignment)
                .where(
                    and(
                        eq(userRoleAssignment.userId, params.uid),
                        eq(userRoleAssignment.isActive, true),
                        or(
                            isNull(userRoleAssignment.expiresAt),
                            gt(userRoleAssignment.expiresAt, now)
                        )
                    )
                )
                .all();
            
            const currentRoleIds = currentAssignments.map(a => a.roleId);
            
            // Roles a añadir (están en selectedRoleIds pero no en currentRoleIds)
            const rolesToAdd = selectedRoleIds.filter(id => !currentRoleIds.includes(id));
            
            // Roles a revocar (están en currentRoleIds pero no en selectedRoleIds)
            const rolesToRevoke = currentRoleIds.filter(id => !selectedRoleIds.includes(id));
            
            // Asignar nuevos roles
            for (const roleId of rolesToAdd) {
                try {
                    await RoleUtils.assignRoleToUser(
                        params.uid,
                        roleId,
                        locals.user.id,
                        'Asignado desde panel de administración'
                    );
                } catch (e) {
                    console.error(`Error asignando rol ${roleId}:`, e);
                }
            }
            
            // Revocar roles
            for (const roleId of rolesToRevoke) {
                try {
                    await RoleUtils.revokeRoleFromUser(
                        params.uid,
                        roleId,
                        locals.user.id,
                        'Revocado desde panel de administración'
                    );
                } catch (e) {
                    console.error(`Error revocando rol ${roleId}:`, e);
                }
            }
            
            return { success: true, rolesUpdated: true };
        } catch (e) {
            console.error('Error actualizando roles:', e);
            return fail(500, { message: 'Error actualizando roles' });
        }
    }
} satisfies Actions;