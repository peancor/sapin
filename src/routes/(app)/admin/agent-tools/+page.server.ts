import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { ROLE_LEVELS } from '$lib/server/roles';
import { BUILTIN_TOOL_USAGE_DOMAINS, isBuiltinToolUsageDomain } from '$lib/server/agent/tools/constants';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) error(401, 'No autenticado');
	if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) error(403, 'Sin permisos');

	const requestedUsageDomain = url.searchParams.get('usageDomain');
	const usageDomain =
		requestedUsageDomain && requestedUsageDomain !== 'all' ? requestedUsageDomain : undefined;

	if (usageDomain !== undefined && !isBuiltinToolUsageDomain(usageDomain)) {
		error(400, `usageDomain no válido: ${usageDomain}`);
	}

	await DBAgentToolUtils.seedBuiltinTools(DBAgentToolUtils.ALL_BUILTIN_USAGE_DOMAINS);
	const tools = await DBAgentToolUtils.getAllToolDefinitions();

	return {
		tools,
		usageDomain: usageDomain ?? 'all',
		availableUsageDomains: BUILTIN_TOOL_USAGE_DOMAINS
	};
};
