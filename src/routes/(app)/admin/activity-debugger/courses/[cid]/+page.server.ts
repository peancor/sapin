import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ActivityDebuggerService } from '$lib/server/activity-debugger';
import { parseActivityDebuggerFilters } from '$lib/server/activity-debugger/query';

export const load = (async ({ params, url, locals }) => {
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	const filters = parseActivityDebuggerFilters(url);
	filters.courseId = params.cid;

	const explorer = await ActivityDebuggerService.getExplorerData(
		{
			actorUserId: locals.user.id,
			actorHighestRoleLevel: locals.user.highestRoleLevel
		},
		filters
	);

	const lockedCourse = explorer.courses.find((course) => course.id === params.cid);
	if (!lockedCourse) {
		throw error(404, 'Curso no encontrado');
	}

	return {
		filters,
		lockedCourse,
		...explorer
	};
}) satisfies PageServerLoad;
