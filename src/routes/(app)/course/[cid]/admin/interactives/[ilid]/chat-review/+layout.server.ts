import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// chat-review is only for chat-type activities.
// Redirect to the equivalent agent review page if needed.
export const load: LayoutServerLoad = async ({ parent, params }) => {
	const { interactive } = await parent();
	const { cid, ilid } = params;

	if (interactive.type !== 'chat') {
		redirect(303, `/course/${cid}/admin/interactives/${ilid}/agent-review`);
	}
};
