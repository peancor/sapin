import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

// Rutas públicas que no requieren verificación de bootstrap
const PUBLIC_PATHS = [
    '/admin/bootstrap',
    '/api/health',
    '/favicon.ico'
];

// Cache simple para evitar consultas repetidas en cada request
let bootstrapCacheValid = false;
let lastBootstrapCheck = 0;
const CACHE_DURATION = 5000; // 5 segundos

async function isSystemBootstrapped(): Promise<boolean> {
    const now = Date.now();
    
    // Si el cache es válido y el sistema ya está inicializado, retornar true
    if (bootstrapCacheValid && (now - lastBootstrapCheck) < CACHE_DURATION) {
        return true;
    }
    
    // Verificar en la base de datos
    const users = await db.select({ id: user.id })
        .from(user)
        .limit(1);
    
    const hasUsers = users.length > 0;
    
    // Solo cachear si hay usuarios (una vez inicializado, no cambia)
    if (hasUsers) {
        bootstrapCacheValid = true;
        lastBootstrapCheck = now;
    }
    
    return hasUsers;
}

export const load = (async ({ url }) => {
    const pathname = url.pathname;
    
    // Permitir acceso a rutas públicas sin verificación
    if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
        return {};
    }

    // Verificar si el sistema está inicializado
    const isBootstrapped = await isSystemBootstrapped();

    // Si no hay usuarios y no estamos en bootstrap, redirigir
    if (!isBootstrapped) {
        throw redirect(302, '/admin/bootstrap');
    }

    return {};
}) satisfies LayoutServerLoad;