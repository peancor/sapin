import type { Actions, PageServerLoad } from './$types';
import {
	deleteLessonStudioFile,
	loadLessonStudioData,
	requireLessonStudioContext,
	uploadLessonStudioFile
} from '$lib/server/lesson/LessonStudioService';

export const load = (async ({ params, locals }) => {
	return loadLessonStudioData(params.cid, params.ilid, locals);
}) satisfies PageServerLoad;

export const actions = {
	uploadFile: async ({ request, params, locals }) => {
		const { user } = await requireLessonStudioContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const file = formData.get('file');

		if (!(file instanceof File)) {
			return {
				success: false
			};
		}

		await uploadLessonStudioFile({
			ilid: params.ilid,
			userId: user.id,
			file
		});

		return { success: true };
	},

	deleteFile: async ({ request, params, locals }) => {
		const { user } = await requireLessonStudioContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const fileId = formData.get('fileId')?.toString();

		if (!fileId) {
			return {
				success: false
			};
		}

		await deleteLessonStudioFile({
			ilid: params.ilid,
			fileId,
			userId: user.id
		});

		return { success: true };
	}
} satisfies Actions;
