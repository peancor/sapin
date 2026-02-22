import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { user, role, userRoleAssignment, roleAuditLog } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { DBUserUtils } from '$lib/server/db';
import * as auth from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import { dev } from '$app/environment';

// Rate limiting simple en memoria (en producción usar Redis)
const bootstrapAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutos

// ============================================
// SYSTEM ROLES - Roles predefinidos del sistema
// ============================================
const SYSTEM_ROLES = [
    {
        id: 'role_super_admin',
        name: 'super_admin',
        displayName: 'Super Administrador',
        description: 'Control total del sistema',
        level: 100,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: true, read: true, update: true, delete: true },
            courses: { create: true, read: true, update: true, delete: true, publish: true },
            settings: { read: true, update: true },
            analytics: { viewOwn: true, viewAll: true, export: true },
            roles: { create: true, read: true, update: true, delete: true, assign: true }
        })
    },
    {
        id: 'role_admin',
        name: 'admin',
        displayName: 'Administrador',
        description: 'Gestión de usuarios y configuración',
        level: 90,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: true, read: true, update: true, delete: false },
            courses: { create: true, read: true, update: true, delete: false, publish: true },
            settings: { read: true, update: false },
            analytics: { viewOwn: true, viewAll: true, export: false },
            roles: { create: false, read: true, update: false, delete: false, assign: true }
        })
    },
    {
        id: 'role_teacher',
        name: 'teacher',
        displayName: 'Profesor',
        description: 'Crear y gestionar cursos',
        level: 50,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: false, read: true, update: false, delete: false },
            courses: { create: true, read: true, update: true, delete: false, publish: true },
            settings: { read: false, update: false },
            analytics: { viewOwn: true, viewAll: false, export: false },
            roles: { create: false, read: false, update: false, delete: false, assign: false }
        })
    },
    {
        id: 'role_assistant',
        name: 'assistant',
        displayName: 'Asistente',
        description: 'Ayudar en cursos sin poder crear',
        level: 40,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: false, read: true, update: false, delete: false },
            courses: { create: false, read: true, update: true, delete: false, publish: false },
            settings: { read: false, update: false },
            analytics: { viewOwn: true, viewAll: false, export: false },
            roles: { create: false, read: false, update: false, delete: false, assign: false }
        })
    },
    {
        id: 'role_student',
        name: 'student',
        displayName: 'Estudiante',
        description: 'Acceso a cursos matriculados',
        level: 10,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: false, read: false, update: false, delete: false },
            courses: { create: false, read: true, update: false, delete: false, publish: false },
            settings: { read: false, update: false },
            analytics: { viewOwn: true, viewAll: false, export: false },
            roles: { create: false, read: false, update: false, delete: false, assign: false }
        })
    },
    {
        id: 'role_user',
        name: 'user',
        displayName: 'Usuario',
        description: 'Usuario básico sin permisos especiales',
        level: 0,
        isSystem: true,
        permissions: JSON.stringify({
            users: { create: false, read: false, update: false, delete: false },
            courses: { create: false, read: false, update: false, delete: false, publish: false },
            settings: { read: false, update: false },
            analytics: { viewOwn: false, viewAll: false, export: false },
            roles: { create: false, read: false, update: false, delete: false, assign: false }
        })
    }
];

/**
 * Seed de roles del sistema durante el bootstrap
 * Crea los roles predefinidos si no existen
 */
async function seedSystemRoles(): Promise<{ success: boolean; created: number; errors: string[] }> {
    const now = new Date();
    let created = 0;
    const errors: string[] = [];
    
    for (const systemRole of SYSTEM_ROLES) {
        try {
            const existingRole = await db
                .select()
                .from(role)
                .where(eq(role.name, systemRole.name))
                .get();
            
            if (!existingRole) {
                await db.insert(role).values({
                    ...systemRole,
                    isActive: true,
                    createdAt: now,
                    updatedAt: now
                });
                created++;
                console.log(`Bootstrap: Rol '${systemRole.displayName}' creado`);
            }
        } catch (error) {
            const errorMsg = `Error creando rol '${systemRole.name}': ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error('Bootstrap:', errorMsg);
            errors.push(errorMsg);
        }
    }
    
    return {
        success: errors.length === 0,
        created,
        errors
    };
}

// Validación de contraseña segura
interface PasswordValidation {
    isValid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong';
}

function validatePassword(password: string): PasswordValidation {
    const errors: string[] = [];
    let score = 0;
    
    if (password.length < 12) {
        errors.push('La contraseña debe tener al menos 12 caracteres');
    } else {
        score += password.length >= 16 ? 2 : 1;
    }
    
    if (!/[a-z]/.test(password)) {
        errors.push('Debe incluir al menos una letra minúscula');
    } else {
        score += 1;
    }
    
    if (!/[A-Z]/.test(password)) {
        errors.push('Debe incluir al menos una letra mayúscula');
    } else {
        score += 1;
    }
    
    if (!/[0-9]/.test(password)) {
        errors.push('Debe incluir al menos un número');
    } else {
        score += 1;
    }
    
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
        errors.push('Debe incluir al menos un carácter especial (!@#$%^&*...)');
    } else {
        score += 1;
    }
    
    // Verificar patrones comunes inseguros
    const commonPatterns = [
        /^(.)\1+$/,          // Caracteres repetidos
        /^(012|123|234|345|456|567|678|789|890)/,  // Secuencias numéricas
        /^(abc|bcd|cde|def|efg|fgh|ghi|hij)/i,    // Secuencias alfabéticas
        /password/i,
        /admin/i,
        /qwerty/i,
        /letmein/i
    ];
    
    for (const pattern of commonPatterns) {
        if (pattern.test(password)) {
            errors.push('La contraseña contiene patrones comunes inseguros');
            score = Math.max(0, score - 2);
            break;
        }
    }
    
    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    if (score >= 5) strength = 'strong';
    else if (score >= 3) strength = 'medium';
    
    return {
        isValid: errors.length === 0,
        errors,
        strength
    };
}

// Validación de email
function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 255;
}

// Validación de username
function validateUsername(username: string): { isValid: boolean; error?: string } {
    if (!username || username.length < 3) {
        return { isValid: false, error: 'El nombre de usuario debe tener al menos 3 caracteres' };
    }
    if (username.length > 50) {
        return { isValid: false, error: 'El nombre de usuario no puede exceder 50 caracteres' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return { isValid: false, error: 'El nombre de usuario solo puede contener letras, números, guiones y guiones bajos' };
    }
    return { isValid: true };
}

// Rate limiting check
function checkRateLimit(ip: string): { allowed: boolean; remainingTime?: number } {
    const now = Date.now();
    const attempt = bootstrapAttempts.get(ip);
    
    if (attempt) {
        // Si está en lockout, verificar si ha pasado el tiempo
        if (attempt.count >= MAX_ATTEMPTS) {
            const timeSinceLastAttempt = now - attempt.lastAttempt;
            if (timeSinceLastAttempt < LOCKOUT_DURATION) {
                return { 
                    allowed: false, 
                    remainingTime: Math.ceil((LOCKOUT_DURATION - timeSinceLastAttempt) / 1000 / 60) 
                };
            }
            // Reset después del lockout
            bootstrapAttempts.delete(ip);
        }
    }
    
    return { allowed: true };
}

function recordAttempt(ip: string) {
    const now = Date.now();
    const attempt = bootstrapAttempts.get(ip);
    
    if (attempt) {
        attempt.count += 1;
        attempt.lastAttempt = now;
    } else {
        bootstrapAttempts.set(ip, { count: 1, lastAttempt: now });
    }
}

function clearAttempts(ip: string) {
    bootstrapAttempts.delete(ip);
}

export const load = (async () => {
    const users = await db.select().from(user).limit(1);
    const hasUsers = users.length > 0;
    
    // Si ya hay usuarios, no permitir acceso al bootstrap
    if (hasUsers) {
        return {
            hasUsers: true,
            canBootstrap: false
        };
    }
    
    // Verificar si hay un rol super_admin disponible
    const superAdminRole = await db
        .select()
        .from(role)
        .where(eq(role.name, 'super_admin'))
        .get();
    
    return {
        hasUsers: false,
        canBootstrap: true,
        hasSuperAdminRole: !!superAdminRole,
        isDev: dev
    };
}) satisfies PageServerLoad;

export const actions = {
    default: async (event) => {
        const { request, getClientAddress } = event;
        const clientIp = getClientAddress();
        
        // Rate limiting check
        const rateCheck = checkRateLimit(clientIp);
        if (!rateCheck.allowed) {
            return fail(429, { 
                error: `Demasiados intentos. Por favor espera ${rateCheck.remainingTime} minutos.`,
                field: 'general'
            });
        }
        
        // Double-check: verificar que no existan usuarios (protección contra race conditions)
        const existingUsers = await db.select({ id: user.id }).from(user).limit(1);
        if (existingUsers.length > 0) {
            return fail(403, { 
                error: 'El sistema ya está inicializado. Este intento ha sido registrado.',
                field: 'general'
            });
        }

        // ============================================
        // PASO 1: Seed de roles del sistema
        // ============================================
        console.log('Bootstrap: Iniciando seed de roles del sistema...');
        const seedResult = await seedSystemRoles();
        
        if (!seedResult.success) {
            console.error('Bootstrap: Error durante el seed de roles:', seedResult.errors);
            return fail(500, {
                error: 'Error al inicializar los roles del sistema. Por favor intenta de nuevo.',
                errors: seedResult.errors,
                field: 'general'
            });
        }
        
        if (seedResult.created > 0) {
            console.log(`Bootstrap: ${seedResult.created} roles creados exitosamente`);
        }

        // ============================================
        // PASO 2: Validar datos del formulario
        // ============================================
        const data = await request.formData();
        const username = data.get('username')?.toString()?.trim();
        const email = data.get('email')?.toString()?.trim()?.toLowerCase();
        const password = data.get('password')?.toString();
        const confirmPassword = data.get('confirmPassword')?.toString();

        // Validación de campos requeridos
        if (!username || !email || !password || !confirmPassword) {
            recordAttempt(clientIp);
            return fail(400, { 
                error: 'Todos los campos son requeridos',
                field: 'general'
            });
        }

        // Validar username
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.isValid) {
            recordAttempt(clientIp);
            return fail(400, { 
                error: usernameValidation.error,
                field: 'username'
            });
        }

        // Validar email
        if (!validateEmail(email)) {
            recordAttempt(clientIp);
            return fail(400, { 
                error: 'Por favor ingresa un email válido',
                field: 'email'
            });
        }

        // Validar que las contraseñas coincidan
        if (password !== confirmPassword) {
            recordAttempt(clientIp);
            return fail(400, { 
                error: 'Las contraseñas no coinciden',
                field: 'confirmPassword'
            });
        }

        // Validar fortaleza de contraseña
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            recordAttempt(clientIp);
            return fail(400, { 
                error: passwordValidation.errors[0],
                errors: passwordValidation.errors,
                field: 'password'
            });
        }

        // ============================================
        // PASO 3: Crear el usuario administrador
        // ============================================
        let userId: string;
        try {
            // Crear el usuario sin rol legacy
            userId = await DBUserUtils.registerUser({
                username,
                password,
                email
            });
            console.log(`Bootstrap: Usuario '${username}' creado con ID: ${userId}`);
        } catch (error) {
            console.error('Bootstrap: Error creating admin user:', error);
            recordAttempt(clientIp);
            return fail(500, { 
                error: 'Error al crear el usuario administrador. Por favor intenta de nuevo.',
                field: 'general'
            });
        }

        // ============================================
        // PASO 4: Asignar rol super_admin del nuevo sistema
        // ============================================
        try {
            const superAdminRole = await db
                .select()
                .from(role)
                .where(eq(role.name, 'super_admin'))
                .get();

            if (superAdminRole) {
                const now = new Date();
                const assignmentId = `ur_bootstrap_${Date.now()}`;
                
                await db.insert(userRoleAssignment).values({
                    id: assignmentId,
                    userId,
                    roleId: superAdminRole.id,
                    assignedBy: null, // Sistema automático
                    assignedAt: now,
                    expiresAt: null,
                    reason: 'Configuración inicial del sistema (bootstrap)',
                    isActive: true
                });

                // Registrar en audit log
                await db.insert(roleAuditLog).values({
                    id: `ral_bootstrap_${Date.now()}`,
                    userId,
                    roleId: superAdminRole.id,
                    roleName: 'super_admin',
                    action: 'assigned',
                    performedBy: null,
                    reason: 'Configuración inicial del sistema (bootstrap)',
                    createdAt: now
                });
                
                console.log(`Bootstrap: Rol 'super_admin' asignado al usuario '${username}'`);
            } else {
                console.warn('Bootstrap: Rol super_admin no encontrado después del seed');
            }
        } catch (roleError) {
            // Log pero no fallar - el usuario ya fue creado con rol legacy
            console.warn('Bootstrap: Could not assign super_admin role from new system:', roleError);
        }

        // ============================================
        // PASO 5: Crear sesión y redirigir
        // ============================================
        // Limpiar intentos después de éxito
        clearAttempts(clientIp);

        // Crear sesión
        const sessionToken = auth.generateSessionToken();
        const session = await auth.createSession(sessionToken, userId);
        auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
        
        console.log('Bootstrap: Configuración inicial completada exitosamente');

        throw redirect(303, '/admin');
    }
} satisfies Actions;