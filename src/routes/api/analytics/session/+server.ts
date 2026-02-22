import { json, type RequestHandler } from '@sveltejs/kit';
import { createSession, getAnalyticsConfig } from '$lib/server/analytics/AnalyticsService';
import { z } from 'zod';

const sessionSchema = z.object({
	visitorId: z.string().min(1),
	userId: z.string().optional(),
	device: z.string().optional(),
	browser: z.string().optional(),
	os: z.string().optional(),
	screenResolution: z.string().optional(),
	language: z.string().optional(),
	referrer: z.string().optional(),
	utmSource: z.string().optional(),
	utmMedium: z.string().optional(),
	utmCampaign: z.string().optional()
});

/**
 * POST /api/analytics/session
 * Crea una nueva sesión de analytics
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const config = await getAnalyticsConfig();

		if (!config.enabled || !config.trackSessions) {
			return json({ sessionId: '' });
		}

		const body = await request.json();
		const result = sessionSchema.safeParse(body);

		if (!result.success) {
			return json({ error: 'Invalid payload' }, { status: 400 });
		}

		const payload = result.data;

		// Si el usuario está autenticado, usar su ID
		const userId = locals.user?.id || payload.userId;

		const sessionId = await createSession({
			...payload,
			userId
		});

		return json({ sessionId });
	} catch (error) {
		console.error('[Analytics Session] Error:', error);
		return json({ sessionId: '' });
	}
};
