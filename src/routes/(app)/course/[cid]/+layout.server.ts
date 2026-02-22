import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { course, courseInteractiveLearning, interactiveLearning } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';

export const load = (async ({ locals, params }) => {
    const { cid } = params;

    const courseData = await db.select().from(course).where(eq(course.id, cid)).limit(1);

    if (!courseData || courseData.length === 0) {
        throw error(404, 'Course not found');
    }

    return {
        course: courseData[0],
    };
    
}) satisfies LayoutServerLoad;