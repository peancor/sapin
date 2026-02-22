import { db, CourseRoleUtils } from '$lib/server/db';
import { user, role, userRoleAssignment } from '$lib/server/db/schema';
import { eq, and, or, isNull, gt } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
    const users = await db
        .select({
            id: user.id,
            email: user.email,
            username: user.username,
            image: user.image,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        })
        .from(user)
        .where(eq(user.id, params.uid));

    if (users.length === 0) {
        throw error(404, 'Usuario no encontrado');
    }

    const userData = users[0];

    // Obtener cursos del usuario usando el nuevo sistema
    const userCourses = await CourseRoleUtils.getUserCourses(params.uid);
    
    const coursesEnrolled = userCourses.filter(c => c.role === 'student').length;
    const coursesTeaching = userCourses.filter(c => 
        ['owner', 'admin', 'teacher', 'assistant'].includes(c.role)
    ).length;

    // Cargar roles del nuevo sistema
    const now = new Date();
    const userRoles = await db
        .select({
            id: role.id,
            name: role.name,
            displayName: role.displayName,
            description: role.description,
            level: role.level,
            isSystem: role.isSystem
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

    return {
        user: userData,
        roles: userRoles,
        courseRoles: userCourses,
        stats: {
            coursesEnrolled,
            coursesTeaching
        }
    };
}) satisfies PageServerLoad;
