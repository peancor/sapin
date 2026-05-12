import { getGradeSyncLogsForCourse, getResourceLinksForCourse } from '$lib/server/lti/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [resourceLinks, gradeSyncLogs] = await Promise.all([
		getResourceLinksForCourse(params.cid),
		getGradeSyncLogsForCourse(params.cid)
	]);

	return {
		resourceLinks,
		gradeSyncLogs
	};
};
