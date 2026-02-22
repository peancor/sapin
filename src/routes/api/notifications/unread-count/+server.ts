import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { notificationService } from '$lib/server/notifications';

/**
 * GET /api/notifications/unread-count
 * Obtiene el contador de notificaciones no leídas (para polling)
 */
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ error: 'No autorizado' }, { status: 401 });
	}

	try {
		const count = await notificationService.getUnreadCount(user.id);

		return json({ count });
	} catch (error) {
		console.error('Error getting unread count:', error);
		return json({ error: 'Error al obtener contador' }, { status: 500 });
	}
};
