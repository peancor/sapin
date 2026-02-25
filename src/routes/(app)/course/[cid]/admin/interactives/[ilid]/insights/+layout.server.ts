import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// insights is only for chat-type activities.
// Agent activities have their own analytics in the agent-review page.
export const load: LayoutServerLoad = async ({ parent, params }) => {
	const { interactive } = await parent();
	const { cid, ilid } = params;

	if (interactive.type !== 'chat') {
		redirect(303, `/course/${cid}/admin/interactives/${ilid}`);
	}
};
