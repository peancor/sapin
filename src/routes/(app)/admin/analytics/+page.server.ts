import { redirect, type ServerLoadEvent } from '@sveltejs/kit';
import {
	getDashboardStats,
	getAnalyticsConfig,
	getActiveUsers,
	getRecentEvents,
	getAnonymousVisitors
} from '$lib/server/analytics/AnalyticsService';

export const load = async ({ locals, url }: ServerLoadEvent) => {
	// Verificar autenticación
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Verificar nivel de rol admin
	const highestRoleLevel = locals.user.highestRoleLevel || 0;

	if (highestRoleLevel < 90) {
		throw redirect(302, '/');
	}

	const period = (url.searchParams.get('period') as 'day' | 'week' | 'month') || 'week';
	const search = url.searchParams.get('search') || '';
	const tab = url.searchParams.get('tab') || 'overview';

	const [stats, config, activeUsers, recentEvents, anonymousVisitors] = await Promise.all([
		getDashboardStats(period),
		getAnalyticsConfig(),
		getActiveUsers({ period, limit: 10, search: search || undefined }),
		getRecentEvents({ limit: 20 }),
		getAnonymousVisitors({ period, limit: 10 })
	]);

	return {
		stats,
		config,
		period,
		search,
		tab,
		activeUsers: activeUsers.users,
		totalActiveUsers: activeUsers.total,
		recentEvents: recentEvents.events,
		totalEvents: recentEvents.total,
		anonymousVisitors
	};
};
