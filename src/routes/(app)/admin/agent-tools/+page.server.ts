import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { ROLE_LEVELS } from '$lib/server/roles';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) error(401, 'No autenticado');
    if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) error(403, 'Sin permisos');

    // Seed herramientas builtin si no existen
    await DBAgentToolUtils.seedBuiltinTools();

    const tools = await DBAgentToolUtils.getAllToolDefinitions();
    return { tools };
};
