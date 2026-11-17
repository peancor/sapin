/**
 * Cabeceras de seguridad comunes a todas las respuestas. No sustituyen a una CSP: reducen
 * el sniffing de tipos, la fuga de URLs por Referer y el acceso a APIs de dispositivo.
 *
 * No se fija `X-Frame-Options` ni `frame-ancestors`: las actividades pueden abrirse desde
 * Moodle y bloquear el enmarcado debe decidirse por despliegue.
 */
const BASE_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
};

const HSTS_VALUE = 'max-age=15552000';

export function applySecurityHeaders(headers: Headers, options: { isHttps: boolean }): void {
	for (const [name, value] of Object.entries(BASE_HEADERS)) {
		if (!headers.has(name)) headers.set(name, value);
	}
	// HSTS solo tiene sentido (y solo se respeta) sobre HTTPS.
	if (options.isHttps && !headers.has('Strict-Transport-Security')) {
		headers.set('Strict-Transport-Security', HSTS_VALUE);
	}
}
