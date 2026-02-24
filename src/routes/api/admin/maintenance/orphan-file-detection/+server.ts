import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { fileStorage } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { ROLE_LEVELS } from '$lib/server/roles';

// Este script es solo lectura: detecta archivos marcados como huérfanos
// o que están activos pero sin entidad referenciada (entityId vacío).
// El campo isOrphan ya existe en el schema para este propósito.

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.user.highestRoleLevel < ROLE_LEVELS.SUPER_ADMIN)
		return new Response('Forbidden', { status: 403 });

	const body = await request.json().catch(() => null);
	const mode = body?.mode;
	if (mode !== 'preview' && mode !== 'execute')
		return json({ error: 'Parámetro "mode" inválido.' }, { status: 400 });

	// Archivos activos que ya tienen isOrphan = true (marcados previamente)
	const alreadyMarked = await db
		.select({
			id: fileStorage.id,
			displayName: fileStorage.displayName,
			name: fileStorage.name,
			category: fileStorage.category,
			entityType: fileStorage.entityType,
			entityId: fileStorage.entityId,
			size: fileStorage.size,
			uploadedAt: fileStorage.uploadedAt
		})
		.from(fileStorage)
		.where(and(eq(fileStorage.isActive, true), eq(fileStorage.isOrphan, true)))
		.all();

	if (mode === 'preview') {
		return json({
			files: alreadyMarked.map((f) => ({
				name: f.displayName ?? f.name,
				category: f.category,
				entityType: f.entityType,
				entityId: f.entityId,
				sizeKb: Math.round(f.size / 1024),
				uploadedAt: f.uploadedAt
			})),
			totalSizeKb: alreadyMarked.reduce((s, f) => s + Math.round(f.size / 1024), 0)
		});
	}

	// execute: marcar para eliminación todos los huérfanos activos
	let marked = 0;
	const now = new Date();
	for (const f of alreadyMarked) {
		await db
			.update(fileStorage)
			.set({ markedForDeletionAt: now, isActive: false })
			.where(eq(fileStorage.id, f.id));
		marked++;
	}

	return json({ marked });
};
