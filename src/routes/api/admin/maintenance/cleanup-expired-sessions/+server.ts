import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { session } from '$lib/server/db/schema';
import { lt } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.user.highestRoleLevel < ROLE_LEVELS.SUPER_ADMIN)
		return new Response('Forbidden', { status: 403 });

	const body = await request.json().catch(() => null);
	const mode = body?.mode;
	if (mode !== 'preview' && mode !== 'execute')
		return json({ error: 'Parámetro "mode" inválido.' }, { status: 400 });

	const now = new Date();

	if (mode === 'preview') {
		const expired = await db.select({ id: session.id }).from(session).where(lt(session.expiresAt, now)).all();
		return json({ count: expired.length });
	}

	const result = await db.delete(session).where(lt(session.expiresAt, now));
	return json({ deleted: result.changes ?? 0 });
};
