import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { notificationService } from '$lib/server/notifications';

/**
 * PATCH /api/notifications/[id]
 * Marca una notificación como leída
 */
export const PATCH: RequestHandler = async ({ locals, params }) => {
	const user = locals.user;

	if (!user) {
		return json({ error: 'No autorizado' }, { status: 401 });
	}

	const { id } = params;

	if (!id) {
		return json({ error: 'ID de notificación requerido' }, { status: 400 });
	}

	try {
		const success = await notificationService.markAsRead(id, user.id);

		if (success) {
			return json({ success: true });
		} else {
			return json({ error: 'No se pudo marcar como leída' }, { status: 400 });
		}
	} catch (error) {
		console.error('Error marking notification as read:', error);
		return json({ error: 'Error al actualizar notificación' }, { status: 500 });
	}
};

/**
 * DELETE /api/notifications/[id]
 * Elimina una notificación
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const user = locals.user;

	if (!user) {
		return json({ error: 'No autorizado' }, { status: 401 });
	}

	const { id } = params;

	if (!id) {
		return json({ error: 'ID de notificación requerido' }, { status: 400 });
	}

	try {
		const success = await notificationService.deleteNotification(id, user.id);

		if (success) {
			return json({ success: true });
		} else {
			return json({ error: 'No se pudo eliminar' }, { status: 400 });
		}
	} catch (error) {
		console.error('Error deleting notification:', error);
		return json({ error: 'Error al eliminar notificación' }, { status: 500 });
	}
};
