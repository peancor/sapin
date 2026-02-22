import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { notificationService, type NotificationTypeKey } from '$lib/server/notifications';

/**
 * GET /api/notifications
 * Lista las notificaciones del usuario autenticado
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;

	if (!user) {
		return json({ error: 'No autorizado' }, { status: 401 });
	}

	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
		const type = url.searchParams.get('type') || undefined;
		const courseId = url.searchParams.get('courseId') || undefined;

		const result = await notificationService.getUserNotifications(user.id, {
			page,
			limit,
			unreadOnly,
			type: type as NotificationTypeKey | undefined,
			courseId
		});

		return json({
			notifications: result.notifications,
			total: result.total,
			page,
			limit,
			totalPages: Math.ceil(result.total / limit)
		});
	} catch (error) {
		console.error('Error fetching notifications:', error);
		return json({ error: 'Error al obtener notificaciones' }, { status: 500 });
	}
};
