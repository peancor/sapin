import { db } from './index';
import { courseInteractiveLearning, courseRole, userInteractiveLearningChat, chat } from './schema';
import { eq, and, inArray } from 'drizzle-orm';
import { ROLE_LEVELS } from '../roles';

// Roles que pueden ver todos los chats de una actividad (no solo los propios)
const STAFF_ROLES = ['owner', 'admin', 'teacher', 'assistant'] as const;

/**
 * Obtiene todos los courseIds donde está asociada una actividad interactiva
 */
async function getInteractiveLearningCourses(ilid: string): Promise<string[]> {
    const courses = await db
        .select({ courseId: courseInteractiveLearning.courseId })
        .from(courseInteractiveLearning)
        .where(eq(courseInteractiveLearning.interactiveLearningId, ilid))
        .all();

    return courses.map(c => c.courseId);
}

/**
 * Obtiene el rol más alto de un usuario en cualquiera de los cursos dados
 */
async function getUserRoleInAnyCourse(
    userId: string,
    courseIds: string[]
): Promise<{ role: string; courseId: string } | null> {
    if (courseIds.length === 0) return null;

    const roles = await db
        .select({
            role: courseRole.role,
            courseId: courseRole.courseId
        })
        .from(courseRole)
        .where(and(
            eq(courseRole.userId, userId),
            inArray(courseRole.courseId, courseIds),
            eq(courseRole.isActive, true)
        ))
        .all();

    if (roles.length === 0) return null;

    // Priorizar roles de staff sobre estudiante
    const staffRole = roles.find(r => STAFF_ROLES.includes(r.role as typeof STAFF_ROLES[number]));
    if (staffRole) return staffRole;

    // Si no hay rol de staff, retornar el primero (probablemente student)
    return roles[0];
}

interface AccessResult {
    allowed: boolean;
    reason?: string;
    isSystemAdmin: boolean;  // true si es admin/super_admin del SISTEMA
    courseRole?: string;     // rol en el curso (si aplica)
    courseId?: string;       // id del curso (si aplica)
}

/**
 * Verifica si un usuario puede acceder a una actividad interactiva.
 * 
 * Retorna allowed=true si:
 * - Es admin del sistema (nivel >= ADMIN)
 * - Tiene cualquier rol activo en al menos uno de los cursos asociados
 */
async function userCanAccessInteractiveActivity(
    userId: string,
    ilid: string,
    userRoleLevel: number
): Promise<AccessResult> {
    // Admin o SuperAdmin del sistema tiene acceso total
    if (userRoleLevel >= ROLE_LEVELS.ADMIN) {
        // Intentar obtener un courseId válido para mantener el contexto de navegación
        const courseIds = await getInteractiveLearningCourses(ilid);
        return {
            allowed: true,
            isSystemAdmin: true,
            courseId: courseIds.length > 0 ? courseIds[0] : undefined
        };
    }

    // Obtener cursos donde está esta actividad
    const courseIds = await getInteractiveLearningCourses(ilid);

    if (courseIds.length === 0) {
        return {
            allowed: false,
            isSystemAdmin: false,
            reason: 'Esta actividad no está asociada a ningún curso'
        };
    }

    // Verificar si el usuario tiene rol en alguno de esos cursos
    const userRole = await getUserRoleInAnyCourse(userId, courseIds);

    if (!userRole) {
        return {
            allowed: false,
            isSystemAdmin: false,
            reason: 'No estás matriculado en ningún curso que incluya esta actividad'
        };
    }

    return {
        allowed: true,
        isSystemAdmin: false,
        courseRole: userRole.role,
        courseId: userRole.courseId
    };
}

interface ChatAccessResult {
    allowed: boolean;
    reason?: string;
    isOwner: boolean;
}

/**
 * Verifica si un usuario puede acceder a un chat específico.
 * 
 * Retorna allowed=true si:
 * - Es admin del sistema
 * - Es profesor/staff del curso (owner, admin, teacher, assistant)
 * - Es el PROPIETARIO del chat (el usuario que lo creó)
 */
async function userCanAccessChat(
    userId: string,
    chatId: string,
    ilid: string,
    userRoleLevel: number
): Promise<ChatAccessResult> {
    // Admin del sistema tiene acceso total
    if (userRoleLevel >= ROLE_LEVELS.ADMIN) {
        // Verificar si es el propietario del chat para el flag isOwner
        const chatOwnership = await db
            .select()
            .from(chat)
            .where(eq(chat.id, chatId))
            .get();

        return {
            allowed: true,
            isOwner: chatOwnership?.userId === userId
        };
    }

    // Verificar si el usuario es el propietario del chat
    const userChat = await db
        .select()
        .from(userInteractiveLearningChat)
        .where(and(
            eq(userInteractiveLearningChat.chatId, chatId),
            eq(userInteractiveLearningChat.userId, userId)
        ))
        .get();

    if (userChat) {
        return { allowed: true, isOwner: true };
    }

    // Si no es el propietario, verificar si tiene rol de staff en el curso
    const courseIds = await getInteractiveLearningCourses(ilid);

    if (courseIds.length === 0) {
        return {
            allowed: false,
            reason: 'Esta actividad no está asociada a ningún curso',
            isOwner: false
        };
    }

    const userRole = await getUserRoleInAnyCourse(userId, courseIds);

    if (!userRole) {
        return {
            allowed: false,
            reason: 'No tienes acceso a este chat',
            isOwner: false
        };
    }

    // Solo staff puede ver chats de otros usuarios
    if (STAFF_ROLES.includes(userRole.role as typeof STAFF_ROLES[number])) {
        return { allowed: true, isOwner: false };
    }

    // Es estudiante pero no es el propietario del chat
    return {
        allowed: false,
        reason: 'Solo puedes acceder a tus propios chats',
        isOwner: false
    };
}

/**
 * Verifica si un usuario puede ver el historial de TODOS los chats de una actividad.
 * 
 * Retorna true si:
 * - Es admin del sistema
 * - Es teacher/assistant/owner/admin del curso específico
 * 
 * Los estudiantes NUNCA pueden ver chats de otros estudiantes.
 */
async function userCanViewAllChats(
    userId: string,
    ilid: string,
    userRoleLevel: number
): Promise<boolean> {
    // Admin del sistema tiene acceso total
    if (userRoleLevel >= ROLE_LEVELS.ADMIN) {
        return true;
    }

    // Obtener cursos donde está esta actividad
    const courseIds = await getInteractiveLearningCourses(ilid);

    if (courseIds.length === 0) {
        return false;
    }

    // Verificar si el usuario tiene rol de staff en alguno de esos cursos
    const userRole = await getUserRoleInAnyCourse(userId, courseIds);

    if (!userRole) {
        return false;
    }

    // Solo staff puede ver todos los chats
    return STAFF_ROLES.includes(userRole.role as typeof STAFF_ROLES[number]);
}

export const InteractiveChatAuthUtils = {
    getInteractiveLearningCourses,
    userCanAccessInteractiveActivity,
    userCanAccessChat,
    userCanViewAllChats
};

export default InteractiveChatAuthUtils;
