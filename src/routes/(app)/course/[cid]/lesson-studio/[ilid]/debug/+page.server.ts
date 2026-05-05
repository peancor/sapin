import type { PageServerLoad } from './$types';

import { LessonDebugService } from '$lib/server/lesson/LessonDebugService';
import { LessonServiceError } from '$lib/server/lesson/LessonService';
import { requireLessonStudioContext } from '$lib/server/lesson/LessonStudioService';
import type { LessonDebugPreviewMode } from '$lib/types/lessonDebug';

function toDebugLoadError(errorValue: unknown, previewMode: LessonDebugPreviewMode) {
	if (errorValue instanceof LessonServiceError) {
		return {
			message: errorValue.message,
			status: errorValue.status,
			previewMode
		};
	}

	if (errorValue instanceof Error) {
		return {
			message: errorValue.message || 'No se pudo preparar el debugger de esta lesson.',
			status: 400,
			previewMode
		};
	}

	return {
		message: 'No se pudo preparar el debugger de esta lesson.',
		status: 500,
		previewMode
	};
}

export const load = (async ({ params, locals, url }) => {
	const { user, activity } = await requireLessonStudioContext(params.cid, params.ilid, locals);
	const previewMode = url.searchParams.get('mode') === 'published' ? 'published' : 'draft';

	try {
		return {
			debugError: null,
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
	} catch (errorValue) {
		return {
			debugError: toDebugLoadError(errorValue, previewMode),
			snapshot: null
		};
	}
}) satisfies PageServerLoad;
