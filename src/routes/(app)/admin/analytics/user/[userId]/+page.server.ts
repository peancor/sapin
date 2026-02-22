import { redirect, error, type ServerLoadEvent } from '@sveltejs/kit';
import { getUserActivityDetail, getAnalyticsConfig } from '$lib/server/analytics/AnalyticsService';

export const load = async ({ locals, params }: ServerLoadEvent) => {
	// Verificar autenticación
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Verificar nivel de rol admin
	const highestRoleLevel = locals.user.highestRoleLevel || 0;

	if (highestRoleLevel < 90) {
		throw redirect(302, '/');
	}

	const userId = (params as Record<string, string>).userId;

	const [userActivity, config] = await Promise.all([
		getUserActivityDetail(userId),
		getAnalyticsConfig()
	]);

	if (!userActivity) {
		throw error(404, 'Usuario no encontrado');
	}

	return {
		userActivity,
		config
	};
};
