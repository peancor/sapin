import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { ROLE_LEVELS } from '$lib/server/roles';
import {
	BUILTIN_TOOL_USAGE_DOMAINS,
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT,
	isBuiltinToolUsageDomain
} from '$lib/server/agent/tools/constants';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) error(401, 'No autenticado');
    if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) error(403, 'Sin permisos');

	const requestedUsageDomain = url.searchParams.get('usageDomain');
	const usageDomain =
		requestedUsageDomain === 'all' ? undefined : requestedUsageDomain ?? BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT;

	if (usageDomain !== undefined && !isBuiltinToolUsageDomain(usageDomain)) {
		error(400, `usageDomain no válido: ${usageDomain}`);
	}

    // Seed herramientas builtin si no existen
    await DBAgentToolUtils.seedBuiltinTools(usageDomain ?? BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT);
    const tools = await DBAgentToolUtils.getAllToolDefinitions(usageDomain);

    return {
		tools,
		usageDomain: usageDomain ?? 'all',
		availableUsageDomains: BUILTIN_TOOL_USAGE_DOMAINS
	};
};
