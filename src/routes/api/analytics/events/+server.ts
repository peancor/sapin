import { json, type RequestHandler } from '@sveltejs/kit';
import { recordEvents, getAnalyticsConfig } from '$lib/server/analytics/AnalyticsService';
import { z } from 'zod';

const eventSchema = z.object({
	type: z.string(),
	name: z.string(),
	path: z.string().optional(),
	title: z.string().optional(),
	referrer: z.string().optional(),
	duration: z.number().optional(),
	metadata: z.record(z.string(), z.unknown()).optional()
});

const batchSchema = z.object({
	sessionId: z.string(),
	visitorId: z.string().min(1),
	userId: z.string().optional(),
	events: z.array(eventSchema).max(100) // Límite de 100 eventos por batch
});

/**
 * POST /api/analytics/events
 * Recibe un batch de eventos de analytics
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const config = await getAnalyticsConfig();

		if (!config.enabled) {
			// Silenciosamente ignorar si está deshabilitado
			return json({ success: true });
		}

		// Soportar tanto JSON como sendBeacon (text/plain)
		let body: unknown;
		const contentType = request.headers.get('content-type') || '';

		if (contentType.includes('application/json')) {
			body = await request.json();
		} else {
			// sendBeacon envía como text/plain
			const text = await request.text();
			try {
				body = JSON.parse(text);
			} catch {
				return json({ error: 'Invalid JSON' }, { status: 400 });
			}
		}

		const result = batchSchema.safeParse(body);

		if (!result.success) {
			console.warn('[Analytics Events] Invalid payload:', result.error.issues);
			return json({ error: 'Invalid payload' }, { status: 400 });
		}

		const payload = result.data;

		// Si el usuario está autenticado, usar su ID
		const userId = locals.user?.id || payload.userId;

		await recordEvents({
			sessionId: payload.sessionId,
			visitorId: payload.visitorId,
			userId,
			events: payload.events.map((e) => ({
				type: e.type as
					| 'page_view'
					| 'page_exit'
					| 'session_start'
					| 'session_end'
					| 'course_view'
					| 'activity_start'
					| 'activity_complete'
					| 'chat_message'
					| 'error',
				name: e.name,
				path: e.path,
				title: e.title,
				referrer: e.referrer,
				duration: e.duration,
				metadata: e.metadata
			}))
		});

		return json({ success: true });
	} catch (error) {
		console.error('[Analytics Events] Error:', error);
		// Retornar success para no bloquear al cliente
		return json({ success: true });
	}
};
