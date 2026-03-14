import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ActivityDebuggerService } from '$lib/server/activity-debugger';

export const load = (async ({ params, url, locals }) => {
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	const detail = await ActivityDebuggerService.getSessionDetail(
		{
			actorUserId: locals.user.id,
			actorHighestRoleLevel: locals.user.highestRoleLevel
		},
		params.ilid,
		params.chatId
	);

	return {
		detail,
		tab: url.searchParams.get('tab') || 'timeline',
		density: url.searchParams.get('density') || 'comfortable'
	};
}) satisfies PageServerLoad;
