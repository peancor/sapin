import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';
import { ROLE_LEVELS } from '$lib/server/roles';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) error(401, 'No autenticado');
    if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) error(403, 'Sin permisos');

    // Seed herramientas builtin si no existen
    await DBAgentUtils.seedBuiltinTools();

    const tools = await DBAgentUtils.getAllToolDefinitions();
    return { tools };
};
