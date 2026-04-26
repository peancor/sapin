import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { course } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireLessonStudioContext } from '$lib/server/lesson/LessonStudioService';

export const load = (async ({ params, locals }) => {
	const [{ activity, lessonConfig }, courseRecord] = await Promise.all([
		requireLessonStudioContext(params.cid, params.ilid, locals),
		db.select().from(course).where(eq(course.id, params.cid)).get()
	]);

	return {
		activity,
		lessonConfig,
		course: courseRecord ?? null
	};
}) satisfies LayoutServerLoad;
