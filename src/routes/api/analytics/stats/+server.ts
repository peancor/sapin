import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getDashboardStats, getAnalyticsConfig } from '$lib/server/analytics/AnalyticsService';

/**
 * GET /api/analytics/stats
 * Obtiene estadísticas del dashboard
 * Requiere autenticación de admin
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	// Verificar autenticación
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	// Verificar rol de admin usando el nuevo sistema de roles
	const highestRoleLevel = locals.user.highestRoleLevel || 0;

	if (highestRoleLevel < 90) {
		throw error(403, 'Acceso denegado');
	}

	try {
		const period = (url.searchParams.get('period') as 'day' | 'week' | 'month') || 'week';
		const stats = await getDashboardStats(period);
		const config = await getAnalyticsConfig();

		return json({
			...stats,
			config: {
				enabled: config.enabled,
				retentionDays: config.retentionDays
			}
		});
	} catch (err) {
		console.error('[Analytics Stats] Error:', err);
		throw error(500, 'Error obteniendo estadísticas');
	}
};
