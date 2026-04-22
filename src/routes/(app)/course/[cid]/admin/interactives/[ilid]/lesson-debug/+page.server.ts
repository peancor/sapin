import type { PageServerLoad } from './$types';

import { LessonDebugService } from '$lib/server/lesson/LessonDebugService';
import { requireLessonAdminContext } from '../lessonedit/lessonAdmin';

export const load = (async ({ params, locals, url }) => {
	const { user, activity } = await requireLessonAdminContext(params.cid, params.ilid, locals);
	const previewMode = url.searchParams.get('mode') === 'published' ? 'published' : 'draft';

	return {
		snapshot: await LessonDebugService.getSnapshot({
			courseId: params.cid,
			activity,
			previewMode,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			sessionId: url.searchParams.get('sessionId'),
			selectedBlockId: url.searchParams.get('blockId')
		})
	};
}) satisfies PageServerLoad;
