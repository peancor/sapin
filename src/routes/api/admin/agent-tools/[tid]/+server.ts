import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { ROLE_LEVELS } from '$lib/server/roles';
import { BUILTIN_TOOL_USAGE_DOMAINS } from '$lib/server/agent/tools/constants';

function adminGuard(locals: App.Locals): Response | null {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });
    if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) return new Response('Forbidden', { status: 403 });
    return null;
}

// GET /api/admin/agent-tools/[tid]
export const GET: RequestHandler = async ({ locals, params }) => {
    const guard = adminGuard(locals);
    if (guard) return guard;

    const tool = await DBAgentToolUtils.getToolDefinitionById(params.tid!);
    if (!tool) return json({ error: 'Herramienta no encontrada' }, { status: 404 });
    return json({ tool });
};

// PUT /api/admin/agent-tools/[tid]
export const PUT: RequestHandler = async ({ locals, params, request }) => {
    const guard = adminGuard(locals);
    if (guard) return guard;

	try {
		const body = await request.json();
		const tool = await DBAgentToolUtils.getToolDefinitionById(params.tid!);
		if (!tool) return json({ error: 'Herramienta no encontrada' }, { status: 404 });

		const updates: Record<string, unknown> = {};
		if (body.displayName !== undefined) updates.displayName = body.displayName;
		if (body.description !== undefined) updates.description = body.description;
		if (body.category !== undefined) updates.category = body.category;
		if (body.riskLevel !== undefined) updates.riskLevel = body.riskLevel;
		if (body.requiresConfirmation !== undefined) updates.requiresConfirmation = body.requiresConfirmation;
		if (body.isActive !== undefined) updates.isActive = body.isActive;
		if (body.version !== undefined) updates.version = body.version;
		if (body.usageDomain !== undefined) {
			if (typeof body.usageDomain !== 'string' || body.usageDomain.trim().length === 0) {
				return json({ error: 'usageDomain debe ser un valor string' }, { status: 400 });
			}

			const requestedDomain = body.usageDomain.trim();
			if (!BUILTIN_TOOL_USAGE_DOMAINS.includes(requestedDomain)) {
				return json({ error: 'usageDomain no válido' }, { status: 400 });
			}
			updates.usageDomain = requestedDomain;
		}

		if (body.parametersSchema !== undefined) {
			try {
				JSON.parse(body.parametersSchema);
				updates.parametersSchema = body.parametersSchema;
			} catch {
				return json({ error: 'parametersSchema no es JSON válido' }, { status: 400 });
			}
		}
		if (body.responseSchema !== undefined) {
			if (body.responseSchema === null || body.responseSchema === '') {
				updates.responseSchema = null;
			} else {
				try {
					JSON.parse(body.responseSchema);
					updates.responseSchema = body.responseSchema;
				} catch {
					return json({ error: 'responseSchema no es JSON válido' }, { status: 400 });
				}
			}
		}
		if (body.executorConfig !== undefined) {
			try {
				JSON.parse(body.executorConfig);
				updates.executorConfig = body.executorConfig;
			} catch {
				return json({ error: 'executorConfig no es JSON válido' }, { status: 400 });
			}
		}

		// No permitir editar el name ni isSystem
		await DBAgentToolUtils.updateToolDefinition(params.tid!, updates as Parameters<typeof DBAgentToolUtils.updateToolDefinition>[1]);
		return json({ success: true });
	} catch (err) {
		console.error('[admin/agent-tools/[tid]] PUT error:', err);
		return json({ error: 'Error al actualizar herramienta' }, { status: 500 });
	}
};

// DELETE /api/admin/agent-tools/[tid]
export const DELETE: RequestHandler = async ({ locals, params }) => {
    const guard = adminGuard(locals);
    if (guard) return guard;

    try {
        const tool = await DBAgentToolUtils.getToolDefinitionById(params.tid!);
        if (!tool) return json({ error: 'Herramienta no encontrada' }, { status: 404 });
        if (tool.isSystem) return json({ error: 'No se pueden eliminar herramientas del sistema' }, { status: 403 });

        await DBAgentToolUtils.deleteToolDefinition(params.tid!);
        return json({ success: true });
    } catch (err) {
        console.error('[admin/agent-tools/[tid]] DELETE error:', err);
        return json({ error: 'Error al eliminar herramienta' }, { status: 500 });
    }
};
