import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import * as auth from '$lib/server/auth.js';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { httpLogger } from '$lib/server/logging';
import cron from 'node-cron';
import { imageProcessingQueue } from '$lib/server/files/ImageProcessingQueue';
import { fileCleanupService } from '$lib/server/files/FileCleanupService';

// ============================================
// CRON JOBS - File Processing and Cleanup
// ============================================

// Daily cleanup at 3:00 AM - removes deleted files and detects orphans
cron.schedule('0 3 * * *', async () => {
	console.log('[Cron] Starting daily file cleanup...');
	try {
		const result = await fileCleanupService.runFullCleanup();
		console.log('[Cron] Cleanup completed:', {
			orphansDetected: result.orphanDetection.orphansFound,
			deletedPurged: result.deletedPurge.deletedCount,
			orphansPurged: result.orphanPurge.deletedCount
		});
	} catch (error) {
		console.error('[Cron] Cleanup failed:', error);
	}
});

// Process pending images every 15 minutes
cron.schedule('*/15 * * * *', async () => {
	try {
		const result = await imageProcessingQueue.processBatch();
		if (result.processed > 0) {
			console.log('[Cron] Image processing completed:', {
				processed: result.processed,
				succeeded: result.succeeded,
				failed: result.failed
			});
		}
	} catch (error) {
		console.error('[Cron] Image processing failed:', error);
	}
});

console.log('[Server] Cron jobs scheduled:');
console.log('  - Daily cleanup: 3:00 AM');
console.log('  - Image processing: Every 15 minutes');

const handleLogging: Handle = async ({ event, resolve }) => {
	const startTime = Date.now();
	const { method } = event.request;
	const path = event.url.pathname;

	const response = await resolve(event);
	const duration = Date.now() - startTime;

	// Log HTTP a stdout (pino) - solo rutas relevantes (excluir assets estaticos)
	// if (!path.startsWith('/_app/') && !path.startsWith('/favicon')) {
	// 	httpLogger.info(
	// 		{
	// 			method,
	// 			path,
	// 			status: response.status,
	// 			duration,
	// 			userId: event.locals.user?.id
	// 		},
	// 		`${method} ${path} ${response.status} ${duration}ms`
	// 	);
	// }

	return response;
};

const handleAuth: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get(auth.sessionCookieName);
	if (!sessionToken) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await auth.validateSessionToken(sessionToken);
	if (session) {
		auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
	} else {
		auth.deleteSessionTokenCookie(event);
	}

	event.locals.user = user;
	event.locals.session = session;

	return resolve(event);
};

// creating a handle to use the paraglide middleware
const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) => {
				return html.replace('%lang%', locale);
			}
		});
	});

export const handle: Handle = sequence(handleLogging, handleAuth, paraglideHandle);
