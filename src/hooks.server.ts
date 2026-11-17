import { sequence } from '@sveltejs/kit/hooks';
import { error, redirect, type Handle } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/roles';
import { CourseRoleUtils } from '$lib/server/db';
import * as auth from '$lib/server/auth.js';
import { paraglideMiddleware } from '$lib/paraglide/server';
import '$lib/server/logging';
import cron from 'node-cron';
import { imageProcessingQueue } from '$lib/server/files/ImageProcessingQueue';
import { fileCleanupService } from '$lib/server/files/FileCleanupService';
import { building } from '$app/environment';
import { startRadarScheduler } from '$lib/server/radar/service';
import { applySecurityHeaders } from '$lib/server/securityHeaders';

if (!building) startRadarScheduler();

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
	const response = await resolve(event);

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

const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	try {
		applySecurityHeaders(response.headers, { isHttps: event.url.protocol === 'https:' });
	} catch {
		// Algunas respuestas (p. ej. las de `fetch` reenviadas) tienen cabeceras inmutables.
	}
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

/**
 * Las acciones de formulario se ejecutan antes que las funciones `load`, por lo que la
 * comprobación de `admin/+layout.server.ts` no las protege. Este guard aplica la misma regla
 * a cualquier petición (GET o acción) de las páginas de administración del sistema.
 * `bootstrap` reinicia el layout y gestiona su propio acceso inicial.
 */
const ADMIN_ROUTE_PREFIX = '/(app)/admin';
const ADMIN_PUBLIC_ROUTES = ['/(app)/admin/bootstrap'];
const COURSE_ADMIN_ROUTE_PREFIX = '/(app)/course/[cid]/admin';

const handleAdminGuard: Handle = async ({ event, resolve }) => {
	const routeId = event.route.id;
	const isAdminRoute =
		routeId !== null &&
		(routeId === ADMIN_ROUTE_PREFIX || routeId.startsWith(`${ADMIN_ROUTE_PREFIX}/`)) &&
		!ADMIN_PUBLIC_ROUTES.some((publicRoute) => routeId.startsWith(publicRoute));

	if (isAdminRoute) {
		if (!event.locals.user) error(401, 'No autenticado');
		if (!isAdmin(event.locals.user.highestRoleLevel)) {
			error(403, 'Acceso denegado: se requiere rol de administrador');
		}
	}

	// Misma regla que `course/[cid]/admin/+layout.server.ts`: admin del sistema o rol de curso
	// >= assistant. Las peticiones de lectura conservan la redirección del layout.
	const isCourseAdminRoute =
		routeId === COURSE_ADMIN_ROUTE_PREFIX || routeId?.startsWith(`${COURSE_ADMIN_ROUTE_PREFIX}/`);
	if (isCourseAdminRoute && event.params.cid) {
		const isRead = event.request.method === 'GET' || event.request.method === 'HEAD';
		const authUser = event.locals.user;
		if (!authUser) {
			if (isRead) redirect(303, '/login');
			error(401, 'No autenticado');
		}
		if (!isAdmin(authUser.highestRoleLevel)) {
			const courseRole = await CourseRoleUtils.getUserHighestCourseRole(
				authUser.id,
				event.params.cid
			);
			if (!courseRole || courseRole.level < CourseRoleUtils.COURSE_ROLE_LEVELS.assistant) {
				if (isRead) redirect(303, '/');
				error(403, 'Acceso denegado a la administración del curso');
			}
		}
	}

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

export const handle: Handle = sequence(
	handleLogging,
	handleSecurityHeaders,
	handleAuth,
	handleAdminGuard,
	paraglideHandle
);
