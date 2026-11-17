import * as auth from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
import { auditService, auditAction } from '$lib/server/logging';

function getClientIP(request: Request): string | null {
	return (
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		null
	);
}

// Sin efectos: cerrar sesión en un GET permitiría hacerlo con un enlace externo o con la
// precarga de datos al pasar el ratón. El cierre real es la acción POST.
export const load = (async (event) => {
	return { hasSession: Boolean(event.locals.session) };
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async (event) => {
		if (event.locals.session) {
			const userId = event.locals.user?.id;
			await auth.invalidateSession(event.locals.session.id);
			auth.deleteSessionTokenCookie(event);

			// Audit log - logout
			await auditService.log({
				action: auditAction.USER_LOGOUT,
				userId: userId,
				ipAddress: getClientIP(event.request),
				userAgent: event.request.headers.get('user-agent'),
				severity: 'info'
			});
		}
		return {
			message: 'Has cerrado sesión. Redirigiendo a la página principal...'
		};
	}
};
