import type { PageServerLoad } from './$types';
import { notificationService, type NotificationTypeKey } from '$lib/server/notifications';
import { redirect } from '@sveltejs/kit';

export const load = (async ({ locals, url }) => {
	const user = locals.user;

	if (!user) {
		throw redirect(302, '/login');
	}

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 20;
	const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
	const type = url.searchParams.get('type') || undefined;

	const { notifications, total } = await notificationService.getUserNotifications(user.id, {
		page,
		limit,
		unreadOnly,
		type: type as NotificationTypeKey | undefined
	});

	return {
		notifications,
		total,
		page,
		limit,
		totalPages: Math.ceil(total / limit),
		filters: {
			unreadOnly,
			type
		}
	};
}) satisfies PageServerLoad;
