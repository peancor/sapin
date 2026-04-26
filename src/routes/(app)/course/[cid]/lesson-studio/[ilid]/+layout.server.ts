import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { course } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireLessonStudioContext } from '$lib/server/lesson/LessonStudioService';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';

export const load = (async ({ params, locals }) => {
	const [{ activity, lessonConfig }, courseRecord, revisionSummary] = await Promise.all([
		requireLessonStudioContext(params.cid, params.ilid, locals),
		db.select().from(course).where(eq(course.id, params.cid)).get(),
		LessonRevisionService.getRevisionAdminSummary(params.ilid)
	]);

	return {
		activity,
		lessonConfig,
		revisionSummary,
		course: courseRecord ?? null
	};
}) satisfies LayoutServerLoad;
