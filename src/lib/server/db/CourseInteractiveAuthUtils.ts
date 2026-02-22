import { db } from './index';
import { courseInteractiveLearning, courseRole } from './schema';
import { eq, and } from 'drizzle-orm';
import { ROLE_LEVELS } from '../roles';
import { CourseRoleUtils } from './CourseRoleUtils';

// Roles de staff que pueden administrar actividades del curso
const STAFF_ROLES = ['owner', 'admin', 'teacher', 'assistant'] as const;

interface AdminAccessResult {
    allowed: boolean;
    reason?: string;
    isSystemAdmin: boolean;
    courseRole?: string;
}

/**
 * Verifica que una actividad interactiva pertenece a un curso específico.
 * 
 * @param courseId - ID del curso
 * @param interactiveId - ID de la actividad interactiva
 * @returns true si la actividad pertenece al curso
 */
async function verifyInteractiveBelongsToCourse(
    courseId: string,
    interactiveId: string
): Promise<boolean> {
    const relation = await db
        .select({ id: courseInteractiveLearning.id })
        .from(courseInteractiveLearning)
        .where(and(
            eq(courseInteractiveLearning.courseId, courseId),
            eq(courseInteractiveLearning.interactiveLearningId, interactiveId)
        ))
        .get();

    return !!relation;
}

/**
 * Verifica si un usuario tiene permisos de administración para una actividad
 * interactiva dentro de un curso específico.
 * 
 * Valida:
 * 1. Que la actividad pertenezca al curso indicado
 * 2. Que el usuario sea admin del sistema O staff del curso
 * 
 * @param userId - ID del usuario
 * @param courseId - ID del curso (de la URL)
 * @param interactiveId - ID de la actividad (de la URL)
 * @param userSystemRoleLevel - Nivel de rol del sistema del usuario
 * @returns Resultado con allowed, reason, isSystemAdmin y courseRole
 */
async function userCanAdminCourseInteractive(
    userId: string,
    courseId: string,
    interactiveId: string,
    userSystemRoleLevel: number
): Promise<AdminAccessResult> {
    // 1. Verificar que la actividad pertenece al curso (previene ataques cross-course)
    const belongsToCourse = await verifyInteractiveBelongsToCourse(courseId, interactiveId);

    if (!belongsToCourse) {
        return {
            allowed: false,
            isSystemAdmin: false,
            reason: 'La actividad no pertenece a este curso'
        };
    }

    // 2. Admin del sistema tiene acceso total
    if (userSystemRoleLevel >= ROLE_LEVELS.ADMIN) {
        return {
            allowed: true,
            isSystemAdmin: true
        };
    }

    // 3. Verificar rol de curso
    const userCourseRole = await CourseRoleUtils.getUserHighestCourseRole(userId, courseId);

    if (!userCourseRole) {
        return {
            allowed: false,
            isSystemAdmin: false,
            reason: 'No tienes rol en este curso'
        };
    }

    // 4. Solo staff puede administrar actividades
    if (!STAFF_ROLES.includes(userCourseRole.role as typeof STAFF_ROLES[number])) {
        return {
            allowed: false,
            isSystemAdmin: false,
            reason: 'No tienes permisos de administración en este curso',
            courseRole: userCourseRole.role
        };
    }

    return {
        allowed: true,
        isSystemAdmin: false,
        courseRole: userCourseRole.role
    };
}

/**
 * Verifica si un usuario puede acceder a un chat específico dentro de un curso.
 * 
 * Para estudiantes: Solo pueden acceder a sus propios chats
 * Para staff: Pueden ver todos los chats del curso
 * 
 * @param userId - ID del usuario
 * @param chatOwnerId - ID del propietario del chat
 * @param courseId - ID del curso
 * @param userSystemRoleLevel - Nivel de rol del sistema del usuario
 * @returns Resultado con allowed y reason
 */
async function userCanAccessChatInCourse(
    userId: string,
    chatOwnerId: string,
    courseId: string,
    userSystemRoleLevel: number
): Promise<{ allowed: boolean; reason?: string; isOwner: boolean }> {
    // Admin del sistema tiene acceso total
    if (userSystemRoleLevel >= ROLE_LEVELS.ADMIN) {
        return {
            allowed: true,
            isOwner: userId === chatOwnerId
        };
    }

    // Verificar rol de curso
    const userCourseRole = await CourseRoleUtils.getUserHighestCourseRole(userId, courseId);

    if (!userCourseRole) {
        return {
            allowed: false,
            reason: 'No estás matriculado en este curso',
            isOwner: false
        };
    }

    // Staff puede ver todos los chats
    if (STAFF_ROLES.includes(userCourseRole.role as typeof STAFF_ROLES[number])) {
        return {
            allowed: true,
            isOwner: userId === chatOwnerId
        };
    }

    // Estudiantes solo pueden ver sus propios chats
    if (userId === chatOwnerId) {
        return {
            allowed: true,
            isOwner: true
        };
    }

    return {
        allowed: false,
        reason: 'Solo puedes acceder a tus propios chats',
        isOwner: false
    };
}

export const CourseInteractiveAuthUtils = {
    verifyInteractiveBelongsToCourse,
    userCanAdminCourseInteractive,
    userCanAccessChatInCourse,
    STAFF_ROLES
};

export default CourseInteractiveAuthUtils;
