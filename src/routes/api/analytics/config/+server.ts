import { json, type RequestHandler } from '@sveltejs/kit';
import { getAnalyticsConfig } from '$lib/server/analytics/AnalyticsService';

/**
 * GET /api/analytics/config
 * Obtiene la configuración de analytics para el cliente
 */
export const GET: RequestHandler = async () => {
	try {
		const config = await getAnalyticsConfig();

		return json({
			enabled: config.enabled,
			trackPageViews: config.trackPageViews,
			trackSessions: config.trackSessions
		});
	} catch (error) {
		console.error('[Analytics Config] Error:', error);
		return json({ enabled: false, trackPageViews: false, trackSessions: false });
	}
};
