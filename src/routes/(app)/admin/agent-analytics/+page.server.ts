import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { ROLE_LEVELS } from '$lib/server/roles';
import { DBAgentAnalyticsUtils } from '$lib/server/db/agent';

export const load = (async ({ locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Not authenticated');
    if (user.highestRoleLevel < ROLE_LEVELS.ADMIN) throw error(403, 'Forbidden');

    const analytics = await DBAgentAnalyticsUtils.getGlobalAgentAnalytics();

    return { analytics };
}) satisfies PageServerLoad;
