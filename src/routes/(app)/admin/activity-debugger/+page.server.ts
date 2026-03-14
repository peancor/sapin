import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ActivityDebuggerService } from '$lib/server/activity-debugger';
import { parseActivityDebuggerFilters } from '$lib/server/activity-debugger/query';

function requireAdmin(locals: App.Locals) {
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	if ((locals.user.highestRoleLevel ?? 0) < 90) {
		throw error(403, 'Sin permisos');
	}

	return locals.user;
}

export const load = (async ({ url, locals }) => {
	const user = requireAdmin(locals);

	const filters = parseActivityDebuggerFilters(url);
	const explorer = await ActivityDebuggerService.getExplorerData(
		{
			actorUserId: user.id,
			actorHighestRoleLevel: user.highestRoleLevel
		},
		filters
	);

	return {
		filters,
		...explorer
	};
}) satisfies PageServerLoad;
