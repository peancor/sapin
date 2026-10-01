import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { ROLE_LEVELS } from '$lib/server/roles';
import { DBAgentUIUtils } from '$lib/server/db/agent';

export const load = (async ({ locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Not authenticated');
    if (user.highestRoleLevel < ROLE_LEVELS.ADMIN) throw error(403, 'Forbidden');

    await DBAgentUIUtils.seedBuiltinUIComponents();
    const components = await DBAgentUIUtils.getAllUIComponents();

    return { components };
}) satisfies PageServerLoad;
