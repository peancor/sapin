import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { ROLE_LEVELS } from '$lib/server/roles';
import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT,
	isBuiltinToolUsageDomain
} from '$lib/server/agent/tools/constants';

// GET /api/admin/agent-tools — listar todas las herramientas
export const GET: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });
    if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN)
        return new Response('Forbidden', { status: 403 });

    try {
		const requestedDomain = url.searchParams.get('usageDomain');
		const usageDomain =
			requestedDomain === 'all' ? undefined : (requestedDomain ?? BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT);

		if (usageDomain !== undefined && !isBuiltinToolUsageDomain(usageDomain)) {
			return json({ error: 'usageDomain no válido' }, { status: 400 });
		}

        const tools = await DBAgentToolUtils.getAllToolDefinitions(usageDomain);
        return json({ tools });
    } catch (err) {
        console.error('[admin/agent-tools] GET error:', err);
        return json({ error: 'Error al obtener herramientas' }, { status: 500 });
    }
};

// POST /api/admin/agent-tools — crear herramienta
export const POST: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });
    if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN)
        return new Response('Forbidden', { status: 403 });

    try {
        const body = await request.json();
        const {
			name,
			displayName,
			description,
			category,
			parametersSchema,
			responseSchema,
			executorType,
			executorConfig,
			requiresConfirmation,
			riskLevel,
			version,
			usageDomain
		} = body;

        if (!name || !displayName || !description || !category || !executorType) {
            return json({ error: 'Campos requeridos: name, displayName, description, category, executorType' }, { status: 400 });
        }

        // Validar que parametersSchema sea JSON válido
        let parsedParams = '{}';
        if (parametersSchema) {
            try { JSON.parse(parametersSchema); parsedParams = parametersSchema; }
            catch { return json({ error: 'parametersSchema no es JSON válido' }, { status: 400 }); }
        }

        let parsedExecutorConfig = '{}';
        if (executorConfig) {
            try { JSON.parse(executorConfig); parsedExecutorConfig = executorConfig; }
            catch { return json({ error: 'executorConfig no es JSON válido' }, { status: 400 }); }
        }

        const requestedDomain =
			typeof usageDomain === 'string' && usageDomain.trim().length > 0 ? usageDomain.trim() : undefined;

		if (requestedDomain !== undefined && !isBuiltinToolUsageDomain(requestedDomain)) {
			return json({ error: 'usageDomain no válido' }, { status: 400 });
		}

        const id = await DBAgentToolUtils.createToolDefinition({
            name,
            displayName,
            description,
            category: category as 'knowledge' | 'evaluation' | 'communication' | 'data' | 'custom',
            parametersSchema: parsedParams,
            responseSchema: responseSchema || null,
            executorType: executorType as 'builtin' | 'http' | 'script',
            executorConfig: parsedExecutorConfig,
            requiresConfirmation: requiresConfirmation === true,
            riskLevel: (riskLevel ?? 'low') as 'low' | 'medium' | 'high',
            usageDomain: requestedDomain ?? BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT,
            isActive: true,
            isSystem: false,
            version: version ?? '1.0.0'
        });

        return json({ success: true, id }, { status: 201 });
    } catch (err) {
        console.error('[admin/agent-tools] POST error:', err);
        return json({ error: 'Error al crear herramienta' }, { status: 500 });
    }
};
