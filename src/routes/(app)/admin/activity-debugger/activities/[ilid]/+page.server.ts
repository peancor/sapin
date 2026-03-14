import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ActivityDebuggerService } from '$lib/server/activity-debugger';
import { parseActivityDebuggerSessionFilters } from '$lib/server/activity-debugger/query';

export const load = (async ({ params, url, locals }) => {
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	const filters = parseActivityDebuggerSessionFilters(url);
	const detail = await ActivityDebuggerService.getActivityDetail(
		{
			actorUserId: locals.user.id,
			actorHighestRoleLevel: locals.user.highestRoleLevel
		},
		params.ilid,
		filters
	);

	return {
		detail,
		filters,
		tab: url.searchParams.get('tab') || 'sessions'
	};
}) satisfies PageServerLoad;
