import { json, type RequestHandler } from '@sveltejs/kit';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { ROLE_LEVELS } from '$lib/server/roles';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.user.highestRoleLevel < ROLE_LEVELS.SUPER_ADMIN)
		return new Response('Forbidden', { status: 403 });

	const body = await request.json().catch(() => null);
	const mode = body?.mode;
	if (mode !== 'preview' && mode !== 'execute') {
		return json({ error: 'Parámetro "mode" inválido. Use "preview" o "execute".' }, { status: 400 });
	}

	try {
		const result = await DBAgentToolUtils.syncBuiltinTools({
			usageDomain: DBAgentToolUtils.ALL_BUILTIN_USAGE_DOMAINS,
			dryRun: mode === 'preview'
		});

		return json(result);
	} catch (err) {
		console.error('[admin/maintenance/sync-builtin-agent-tools] POST error:', err);
		return json(
			{ error: 'No se pudo sincronizar el catálogo built-in de herramientas agénticas.' },
			{ status: 500 }
		);
	}
};
