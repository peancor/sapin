import type { PageServerLoad } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import {
    course,
    user,
    role,
    userRoleAssignment,
    courseInteractiveLearning,
    courseProgressSummary
} from '$lib/server/db/schema';
import { eq, or, inArray, and, isNull, gt, gte, count } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';

interface CourseLastRebuildInfo {
    rebuildAt: string;
    mode: string;
    requestedBy: string | null;
}

function parseCourseLastRebuild(metadataJson: string | null): CourseLastRebuildInfo | null {
    if (!metadataJson) return null;

    try {
        const parsed = JSON.parse(metadataJson) as {
            custom?: { rebuildAt?: string; mode?: string; requestedBy?: string };
        };
        const rebuildAt = parsed?.custom?.rebuildAt;
        if (!rebuildAt) return null;

        return {
            rebuildAt,
            mode: parsed?.custom?.mode ?? 'unknown',
            requestedBy: parsed?.custom?.requestedBy ?? null
        };
    } catch {
        return null;
    }
}

export const load = (async () => {
    // Get all courses
    const courses = await db.select().from(course);
    
    // Get users with teacher-level roles (level >= 50)
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
    
    let teachers: Array<{ id: string; username: string | null; email: string }> = [];
    if (teacherUserIds.length > 0) {
        teachers = await db.select({
            id: user.id,
            username: user.username,
            email: user.email
        })
        .from(user)
        .where(inArray(user.id, teacherUserIds));
    }
    
    // Get activity counts for each course
    const activityCounts = await db.select({
        courseId: courseInteractiveLearning.courseId,
        count: count()
    })
    .from(courseInteractiveLearning)
    .groupBy(courseInteractiveLearning.courseId);

    const activityCountMap = new Map(activityCounts.map(ac => [ac.courseId, ac.count]));

    const summaryRows = await db.select({
        courseId: courseProgressSummary.courseId,
        metadataJson: courseProgressSummary.metadataJson
    }).from(courseProgressSummary);

    const courseLastRebuildMap = new Map<string, CourseLastRebuildInfo>();
    for (const row of summaryRows) {
        const parsed = parseCourseLastRebuild(row.metadataJson);
        if (!parsed) continue;

        const existing = courseLastRebuildMap.get(row.courseId);
        if (!existing || new Date(parsed.rebuildAt) > new Date(existing.rebuildAt)) {
            courseLastRebuildMap.set(row.courseId, parsed);
        }
    }

    // Get course roles for each course
    const coursesWithRoles = await Promise.all(courses.map(async (c) => {
        const courseUsers = await CourseRoleUtils.getCourseUsers(c.id);
        return {
            ...c,
            courseRoles: courseUsers,
            activityCount: activityCountMap.get(c.id) || 0,
            lastProgressRebuild: courseLastRebuildMap.get(c.id) ?? null
        };
    }));

    return {
        courses: coursesWithRoles,
        teachers
    };
}) satisfies PageServerLoad;