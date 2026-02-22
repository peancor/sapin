import { error, type RequestHandler } from '@sveltejs/kit';
import { getRealtimeStats, getAnalyticsConfig } from '$lib/server/analytics/AnalyticsService';

/**
 * GET /api/analytics/realtime
 * Server-Sent Events para estadísticas en tiempo real
 * Requiere autenticación de admin
 */
export const GET: RequestHandler = async ({ locals }) => {
	// Verificar autenticación
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	// Verificar rol de admin usando el nuevo sistema de roles
	const highestRoleLevel = locals.user.highestRoleLevel || 0;

	if (highestRoleLevel < 90) {
		throw error(403, 'Acceso denegado');
	}

	const config = await getAnalyticsConfig();

	// Control de estado del stream
	let isStreamClosed = false;
	let interval: ReturnType<typeof setInterval> | null = null;

	// Crear stream SSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const sendStats = async () => {
				// No intentar enviar si el stream está cerrado
				if (isStreamClosed) {
					if (interval) {
						clearInterval(interval);
						interval = null;
					}
					return;
				}

				try {
					const stats = await getRealtimeStats();
					const data = `data: ${JSON.stringify({ ...stats, enabled: config.enabled })}\n\n`;
					controller.enqueue(encoder.encode(data));
				} catch (err) {
					// Verificar si el error es porque el controller está cerrado
					if (err instanceof TypeError && String(err).includes('Controller is already closed')) {
						isStreamClosed = true;
						if (interval) {
							clearInterval(interval);
							interval = null;
						}
						return;
					}
					console.error('[Analytics Realtime] Error:', err);
					try {
						const errorData = `data: ${JSON.stringify({ error: 'Error fetching stats' })}\n\n`;
						controller.enqueue(encoder.encode(errorData));
					} catch {
						// Ignorar errores al enviar el mensaje de error
						isStreamClosed = true;
						if (interval) {
							clearInterval(interval);
							interval = null;
						}
					}
				}
			};

			// Enviar stats iniciales
			await sendStats();

			// Enviar actualizaciones cada 5 segundos
			if (!isStreamClosed) {
				interval = setInterval(sendStats, 5000);
			}
		},
		cancel() {
			// Stream cancelado por el cliente
			isStreamClosed = true;
			if (interval) {
				clearInterval(interval);
				interval = null;
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
