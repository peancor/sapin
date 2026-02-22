import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, RoleUtils } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { DBUserUtils } from '$lib/server/db';

export const load = (async ({ locals }) => {
    if (!locals.user) {
        throw error(401, 'No autorizado');
    }

    const userData = await db
        .select()
        .from(user)
        .where(eq(user.id, locals.user.id))
        .get();

    if (!userData) {
        throw error(404, 'Usuario no encontrado');
    }

    // Cargar roles del nuevo sistema
    const userRoles = await RoleUtils.getUserRoles(locals.user.id);

    return {
        user: userData,
        roles: userRoles
    };
}) satisfies PageServerLoad;

export const actions = {
    updateProfile: async ({ request, locals }) => {
        if (!locals.user) {
            throw error(401, 'No autorizado');
        }

        try {
            const data = await request.formData();
            const username = data.get('username') as string;
            const alias = data.get('alias') as string;
            const age = data.get('age') ? parseInt(data.get('age') as string) : null;

            await db
                .update(user)
                .set({
                    username,
                    alias,
                    age,
                    updatedAt: new Date()
                })
                .where(eq(user.id, locals.user.id))
                .run();

            return { success: true };
        } catch (e) {
            console.error('Error updating profile:', e);
            throw error(500, 'Error al actualizar el perfil');
        }
    },

    updateAvatar: async ({ request, locals }) => {
        if (!locals.user) {
            throw error(401, 'No autorizado');
        }

        try {
            const data = await request.formData();
            const avatar = data.get('avatar') as File;

            if (avatar) {
                // Upload using new file storage system
                const result = await fileStorageService.upload({
                    file: avatar,
                    category: 'avatar',
                    entityType: 'user',
                    entityId: locals.user.id,
                    uploadedBy: locals.user.id,
                    displayName: `Avatar de ${locals.user.username || locals.user.id}`
                });

                if (!result.success) {
                    throw error(500, result.error || 'Error al subir el avatar');
                }

                // Save file URL in user.image field
                const fileUrl = `/api/files/${result.fileId}`;

                await db
                    .update(user)
                    .set({
                        image: fileUrl,
                        updatedAt: new Date()
                    })
                    .where(eq(user.id, locals.user.id))
                    .run();
            }

            return { success: true };
        } catch (e) {
            console.error('Error updating avatar:', e);
            throw error(500, 'Error al actualizar el avatar');
        }
    },

    updatePassword: async ({ request, locals }) => {
        if (!locals.user) {
            throw error(401, 'No autorizado');
        }

        try {
            const data = await request.formData();
            const currentPassword = data.get('currentPassword') as string;
            const password = data.get('password') as string;

            // Verificar la contraseña actual
            const isValid = await DBUserUtils.verifyPassword(locals.user.id, currentPassword);
            if (!isValid) {
                return { success: false, error: 'La contraseña actual es incorrecta' };
            }
            
            await DBUserUtils.changePassword(locals.user.id, password);
            return { success: true };
        } catch (e) {
            console.error('Error updating password:', e);
            throw error(500, 'Error al actualizar la contraseña');
        }
    },

    deleteAvatar: async ({ locals }) => {
        if (!locals.user) {
            throw error(401, 'No autorizado');
        }

        try {
            // Get current user data
            const userData = await db
                .select()
                .from(user)
                .where(eq(user.id, locals.user.id))
                .get();

            // If user has an avatar in the new system, delete it
            if (userData?.image && userData.image.startsWith('/api/files/')) {
                const fileId = userData.image.replace('/api/files/', '');
                await fileStorageService.delete(fileId, locals.user.id);
            }

            // Update user record
            await db
                .update(user)
                .set({
                    image: null,
                    updatedAt: new Date()
                })
                .where(eq(user.id, locals.user.id))
                .run();

            return { success: true };
        } catch (e) {
            console.error('Error deleting avatar:', e);
            throw error(500, 'Error al eliminar el avatar');
        }
    }
} satisfies Actions;