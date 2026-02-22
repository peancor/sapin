import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { notificationService } from '$lib/server/notifications';

/**
 * POST /api/notifications/read-all
 * Marca todas las notificaciones como leídas
 */
export const POST: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ error: 'No autorizado' }, { status: 401 });
	}

	try {
		const success = await notificationService.markAllAsRead(user.id);

		if (success) {
			return json({ success: true });
		} else {
			return json({ error: 'No se pudieron marcar como leídas' }, { status: 400 });
		}
	} catch (error) {
		console.error('Error marking all notifications as read:', error);
		return json({ error: 'Error al actualizar notificaciones' }, { status: 500 });
	}
};
