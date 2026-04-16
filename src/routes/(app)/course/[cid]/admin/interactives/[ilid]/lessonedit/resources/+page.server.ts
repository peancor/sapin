import type { Actions, PageServerLoad } from './$types';
import { loadLessonAdminData, requireLessonAdminContext, uploadLessonFile, deleteLessonFile } from '../lessonAdmin';

export const load = (async ({ params, locals }) => {
	return loadLessonAdminData(params.cid, params.ilid, locals);
}) satisfies PageServerLoad;

export const actions = {
	uploadFile: async ({ request, params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const file = formData.get('file');

		if (!(file instanceof File)) {
			return {
				success: false
			};
		}

		await uploadLessonFile({
			ilid: params.ilid,
			userId: user.id,
			file
		});

		return { success: true };
	},

	deleteFile: async ({ request, params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const fileId = formData.get('fileId')?.toString();

		if (!fileId) {
			return {
				success: false
			};
		}

		await deleteLessonFile({
			ilid: params.ilid,
			fileId,
			userId: user.id
		});

		return { success: true };
	}
} satisfies Actions;
