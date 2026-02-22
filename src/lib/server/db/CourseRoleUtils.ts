import { db } from './index';
import { courseRole, courseRoleType, user, course } from './schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Niveles de permisos por rol de curso
const COURSE_ROLE_LEVELS = {
    owner: 100,
    admin: 90,
    teacher: 70,
    assistant: 50,
    grader: 30,
    student: 10
} as const;

// Permisos por defecto para cada rol de curso
const DEFAULT_COURSE_PERMISSIONS = {
    owner: {
        editCourse: true,
        deleteCourse: true,
        manageUsers: true,
        createActivities: true,
        grade: true,
        viewAnalytics: true,
        doActivities: true
    },
    admin: {
        editCourse: true,
        deleteCourse: false,
        manageUsers: true,
        createActivities: true,
        grade: true,
        viewAnalytics: true,
        doActivities: true
    },
    teacher: {
        editCourse: true,
        deleteCourse: false,
        manageUsers: true,
        createActivities: true,
        grade: true,
        viewAnalytics: true,
        doActivities: true
    },
    assistant: {
        editCourse: false,
        deleteCourse: false,
        manageUsers: false,
        createActivities: true,
        grade: true,
        viewAnalytics: true,
        doActivities: true
    },
    grader: {
        editCourse: false,
        deleteCourse: false,
        manageUsers: false,
        createActivities: false,
        grade: true,
        viewAnalytics: false,
        doActivities: false
    },
    student: {
        editCourse: false,
        deleteCourse: false,
        manageUsers: false,
        createActivities: false,
        grade: false,
        viewAnalytics: false,
        doActivities: true
    }
} as const;

type CourseRoleTypeName = typeof courseRoleType[keyof typeof courseRoleType];
type CoursePermissions = typeof DEFAULT_COURSE_PERMISSIONS[keyof typeof DEFAULT_COURSE_PERMISSIONS];

/**
 * Obtiene todos los roles de un usuario en un curso específico
 */
async function getUserCourseRoles(userId: string, courseId: string) {
    const roles = await db
        .select({
            id: courseRole.id,
            role: courseRole.role,
            permissions: courseRole.permissions,
            assignedAt: courseRole.assignedAt,
            isActive: courseRole.isActive
        })
        .from(courseRole)
        .where(
            and(
                eq(courseRole.userId, userId),
                eq(courseRole.courseId, courseId),
                eq(courseRole.isActive, true)
            )
        )
        .all();

    return roles.map(r => ({
        ...r,
        level: COURSE_ROLE_LEVELS[r.role as CourseRoleTypeName] || 0,
        permissions: r.permissions ? JSON.parse(r.permissions) : DEFAULT_COURSE_PERMISSIONS[r.role as CourseRoleTypeName]
    }));
}

/**
 * Obtiene el rol más alto de un usuario en un curso
 */
async function getUserHighestCourseRole(userId: string, courseId: string) {
    const roles = await getUserCourseRoles(userId, courseId);
    if (roles.length === 0) return null;

    return roles.reduce((highest, current) => 
        current.level > highest.level ? current : highest
    );
}

/**
 * Verifica si un usuario tiene un rol específico en un curso
 */
async function userHasCourseRole(userId: string, courseId: string, roleName: CourseRoleTypeName): Promise<boolean> {
    const roles = await getUserCourseRoles(userId, courseId);
    return roles.some(r => r.role === roleName);
}

/**
 * Verifica si un usuario tiene al menos cierto nivel de permisos en un curso
 */
async function userHasCourseRoleLevel(userId: string, courseId: string, minLevel: number): Promise<boolean> {
    const highestRole = await getUserHighestCourseRole(userId, courseId);
    return highestRole ? highestRole.level >= minLevel : false;
}

/**
 * Verifica si un usuario tiene un permiso específico en un curso
 */
async function userHasCoursePermission(userId: string, courseId: string, permission: keyof CoursePermissions): Promise<boolean> {
    const roles = await getUserCourseRoles(userId, courseId);
    
    for (const role of roles) {
        if (role.permissions && role.permissions[permission]) {
            return true;
        }
    }
    
    return false;
}

/**
 * Asigna un rol a un usuario en un curso
 */
async function assignCourseRole(
    courseId: string,
    userId: string,
    roleName: CourseRoleTypeName,
    assignedBy?: string,
    customPermissions?: Partial<CoursePermissions>
): Promise<{ success: boolean; error?: string; roleId?: string }> {
    try {
        // Verificar que el curso existe
        const courseExists = await db
            .select({ id: course.id })
            .from(course)
            .where(eq(course.id, courseId))
            .get();

        if (!courseExists) {
            return { success: false, error: 'Curso no encontrado' };
        }

        // Verificar que el usuario existe
        const userExists = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, userId))
            .get();

        if (!userExists) {
            return { success: false, error: 'Usuario no encontrado' };
        }

        // Verificar si ya tiene el rol
        const existingRole = await db
            .select()
            .from(courseRole)
            .where(
                and(
                    eq(courseRole.courseId, courseId),
                    eq(courseRole.userId, userId),
                    eq(courseRole.role, roleName),
                    eq(courseRole.isActive, true)
                )
            )
            .get();

        if (existingRole) {
            return { success: false, error: 'El usuario ya tiene este rol en el curso' };
        }

        // Crear el nuevo rol
        const roleId = nanoid();
        const permissions = customPermissions 
            ? JSON.stringify({ ...DEFAULT_COURSE_PERMISSIONS[roleName], ...customPermissions })
            : null;

        await db.insert(courseRole).values({
            id: roleId,
            courseId,
            userId,
            role: roleName,
            permissions,
            assignedBy: assignedBy || null,
            assignedAt: new Date(),
            isActive: true
        }).run();

        return { success: true, roleId };
    } catch (error) {
        console.error('Error asignando rol de curso:', error);
        return { success: false, error: 'Error interno al asignar rol' };
    }
}

/**
 * Revoca un rol de un usuario en un curso
 */
async function revokeCourseRole(
    courseId: string,
    userId: string,
    roleName: CourseRoleTypeName
): Promise<{ success: boolean; error?: string }> {
    try {
        const result = await db
            .update(courseRole)
            .set({ isActive: false })
            .where(
                and(
                    eq(courseRole.courseId, courseId),
                    eq(courseRole.userId, userId),
                    eq(courseRole.role, roleName),
                    eq(courseRole.isActive, true)
                )
            )
            .run();

        if (result.changes === 0) {
            return { success: false, error: 'Rol no encontrado' };
        }

        return { success: true };
    } catch (error) {
        console.error('Error revocando rol de curso:', error);
        return { success: false, error: 'Error interno al revocar rol' };
    }
}

/**
 * Obtiene todos los usuarios con roles en un curso
 */
async function getCourseUsers(courseId: string) {
    const users = await db
        .select({
            userId: courseRole.userId,
            role: courseRole.role,
            assignedAt: courseRole.assignedAt,
            username: user.username,
            email: user.email,
            image: user.image,
            alias: user.alias
        })
        .from(courseRole)
        .innerJoin(user, eq(courseRole.userId, user.id))
        .where(
            and(
                eq(courseRole.courseId, courseId),
                eq(courseRole.isActive, true)
            )
        )
        .orderBy(desc(courseRole.assignedAt))
        .all();

    return users.map(u => ({
        ...u,
        level: COURSE_ROLE_LEVELS[u.role as CourseRoleTypeName] || 0
    }));
}

/**
 * Obtiene todos los cursos donde un usuario tiene roles
 */
async function getUserCourses(userId: string) {
    const courses = await db
        .select({
            courseId: courseRole.courseId,
            role: courseRole.role,
            assignedAt: courseRole.assignedAt,
            courseName: course.name,
            courseImage: course.image,
            courseDescription: course.description
        })
        .from(courseRole)
        .innerJoin(course, eq(courseRole.courseId, course.id))
        .where(
            and(
                eq(courseRole.userId, userId),
                eq(courseRole.isActive, true)
            )
        )
        .orderBy(desc(courseRole.assignedAt))
        .all();

    return courses.map(c => ({
        ...c,
        level: COURSE_ROLE_LEVELS[c.role as CourseRoleTypeName] || 0
    }));
}

/**
 * Verifica si un usuario puede gestionar a otro en un curso
 */
async function canManageUserInCourse(managerId: string, targetUserId: string, courseId: string): Promise<boolean> {
    const managerRole = await getUserHighestCourseRole(managerId, courseId);
    const targetRole = await getUserHighestCourseRole(targetUserId, courseId);

    if (!managerRole) return false;
    
    // Debe tener permiso de gestionar usuarios
    if (!managerRole.permissions?.manageUsers) return false;

    // Si el target no tiene rol, puede gestionarlo
    if (!targetRole) return true;

    // Solo puede gestionar a usuarios con nivel menor
    return managerRole.level > targetRole.level;
}

export const CourseRoleUtils = {
    COURSE_ROLE_LEVELS,
    DEFAULT_COURSE_PERMISSIONS,
    getUserCourseRoles,
    getUserHighestCourseRole,
    userHasCourseRole,
    userHasCourseRoleLevel,
    userHasCoursePermission,
    assignCourseRole,
    revokeCourseRole,
    getCourseUsers,
    getUserCourses,
    canManageUserInCourse
};

export default CourseRoleUtils;
