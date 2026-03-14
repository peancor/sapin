import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ActivityDebuggerService } from '$lib/server/activity-debugger';
import { parseActivityDebuggerFilters } from '$lib/server/activity-debugger/query';

export const load = (async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	const filters = parseActivityDebuggerFilters(url);
	const explorer = await ActivityDebuggerService.getExplorerData(
		{
			actorUserId: locals.user.id,
			actorHighestRoleLevel: locals.user.highestRoleLevel
		},
		filters
	);

	return {
		filters,
		...explorer
	};
}) satisfies PageServerLoad;
