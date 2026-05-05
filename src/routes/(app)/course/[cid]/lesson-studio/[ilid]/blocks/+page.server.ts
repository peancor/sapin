import type { PageServerLoad } from './$types';
import { loadLessonStudioData } from '$lib/server/lesson/LessonStudioService';

export const load = (async ({ params, locals }) => {
	return loadLessonStudioData(params.cid, params.ilid, locals);
}) satisfies PageServerLoad;
