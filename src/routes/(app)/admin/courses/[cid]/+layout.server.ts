import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import {
    course,
    courseInteractiveLearning,
    interactiveLearning,
    courseProgressSummary
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
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

export const load = (async ({ locals, params }) => {
    const authUser = locals.user;
    if (!authUser) {
        throw redirect(303, '/login');
    }

    // Only admins can access this section
    if (authUser.highestRoleLevel < ROLE_LEVELS.ADMIN) {
        throw redirect(303, '/');
    }

    const { cid } = params;

    const [courseData] = await db.select()
        .from(course)
        .where(eq(course.id, cid))
        .limit(1);

    if (!courseData) {
        throw error(404, 'Curso no encontrado');
    }

    // Get course activities
    const interactives = await db
        .select({
            id: interactiveLearning.id,
            name: interactiveLearning.name,
            description: interactiveLearning.description,
            type: interactiveLearning.type,
            status: interactiveLearning.status,
            order: courseInteractiveLearning.order
        })
        .from(courseInteractiveLearning)
        .innerJoin(
            interactiveLearning,
            eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
        )
        .where(eq(courseInteractiveLearning.courseId, cid))
        .orderBy(courseInteractiveLearning.order);

    // Get course users
    const courseUsers = await CourseRoleUtils.getCourseUsers(cid);

    const teachers = courseUsers
        .filter(u => ['owner', 'admin', 'teacher', 'assistant'].includes(u.role))
        .map(u => ({
            id: u.userId,
            username: u.username,
            email: u.email,
            image: u.image,
            role: u.role
        }));

    const students = courseUsers
        .filter(u => u.role === 'student')
        .map(u => ({
            id: u.userId,
            username: u.username,
            email: u.email,
            image: u.image
        }));

    const summaryRows = await db
        .select({ metadataJson: courseProgressSummary.metadataJson })
        .from(courseProgressSummary)
        .where(eq(courseProgressSummary.courseId, cid));

    let lastProgressRebuild: CourseLastRebuildInfo | null = null;
    for (const row of summaryRows) {
        const parsed = parseCourseLastRebuild(row.metadataJson);
        if (!parsed) continue;

        if (!lastProgressRebuild || new Date(parsed.rebuildAt) > new Date(lastProgressRebuild.rebuildAt)) {
            lastProgressRebuild = parsed;
        }
    }

    return {
        course: courseData,
        interactives,
        teachers,
        students,
        lastProgressRebuild
    };
}) satisfies LayoutServerLoad;
