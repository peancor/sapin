//este es el layout de la jerarquia admin
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Nivel mínimo requerido para acceder a admin (90 = admin, 100 = super_admin)
const ADMIN_LEVEL = 90;

export const load = (async ({ locals }) => {
    // Verificar autenticación
    if (!locals.user) {
        error(401, 'No autenticado');
    }
    
    // Verificar rol usando el nuevo sistema de niveles
    // highestRoleLevel viene del auth.ts y contiene el nivel del rol más alto del usuario
    if (locals.user.highestRoleLevel < ADMIN_LEVEL) {
        error(403, 'Acceso denegado: se requiere rol de administrador');
    }
    
    // Pasar datos del usuario al layout
    return {
        user: {
            id: locals.user.id,
            username: locals.user.username,
            email: locals.user.email,
            image: locals.user.image,
            highestRoleLevel: locals.user.highestRoleLevel,
            highestRoleName: locals.user.highestRole?.name ?? null
        }
    };
}) satisfies LayoutServerLoad;