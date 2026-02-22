/**
 * Constantes y utilidades para el sistema de roles
 * Usar estos valores para verificar niveles de acceso en las rutas
 */

export const ROLE_LEVELS = {
    SUPER_ADMIN: 100,
    ADMIN: 90,
    TEACHER: 50,
    ASSISTANT: 40,
    STUDENT: 10
} as const;

export const ROLE_NAMES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    TEACHER: 'teacher',
    ASSISTANT: 'assistant',
    STUDENT: 'student'
} as const;

/**
 * Verifica si un usuario tiene al menos el nivel de rol especificado
 */
export function hasMinRoleLevel(userLevel: number, requiredLevel: number): boolean {
    return userLevel >= requiredLevel;
}

/**
 * Verifica si un usuario tiene el rol de admin o superior
 */
export function isAdmin(userLevel: number): boolean {
    return userLevel >= ROLE_LEVELS.ADMIN;
}

/**
 * Verifica si un usuario tiene el rol de teacher o superior
 */
export function isTeacher(userLevel: number): boolean {
    return userLevel >= ROLE_LEVELS.TEACHER;
}

/**
 * Verifica si un usuario tiene el rol de assistant o superior
 */
export function isAssistant(userLevel: number): boolean {
    return userLevel >= ROLE_LEVELS.ASSISTANT;
}

/**
 * Verifica si un usuario es al menos estudiante (autenticado con rol)
 */
export function isStudent(userLevel: number): boolean {
    return userLevel >= ROLE_LEVELS.STUDENT;
}
