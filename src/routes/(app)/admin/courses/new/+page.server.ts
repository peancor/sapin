import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user, role, userRoleAssignment } from '$lib/server/db/schema';
import { eq, inArray, and, isNull, or, gt, gte } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';

export const load = (async () => {
    // Get users with teacher-level roles (level >= 50) from the new system
    const now = new Date();
    const teacherAssignments = await db.select({
        userId: userRoleAssignment.userId
    })
    .from(userRoleAssignment)
    .innerJoin(role, eq(userRoleAssignment.roleId, role.id))
    .where(
        and(
            eq(userRoleAssignment.isActive, true),
            eq(role.isActive, true),
            gte(role.level, ROLE_LEVELS.TEACHER),
            or(
                isNull(userRoleAssignment.expiresAt),
                gt(userRoleAssignment.expiresAt, now)
            )
        )
    );
    
    const teacherUserIds = [...new Set(teacherAssignments.map(a => a.userId))];
    
    let teachers: Array<{ id: string; username: string; email: string; image: string | null }> = [];
    
    if (teacherUserIds.length > 0) {
        const rawTeachers = await db.select({
            id: user.id,
            username: user.username,
            email: user.email,
            image: user.image
        })
        .from(user)
        .where(inArray(user.id, teacherUserIds));
        
        teachers = rawTeachers.map(t => ({
            ...t,
            username: t.username ?? 'Sin nombre'
        }));
    }

    return {
        teachers
    };
}) satisfies PageServerLoad;
