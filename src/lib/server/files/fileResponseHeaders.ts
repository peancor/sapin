/**
 * Cabeceras de respuesta para ficheros subidos por usuarios.
 *
 * El tipo MIME guardado es el que declaró el cliente al subir, así que no es fiable: un
 * fichero HTML o SVG servido `inline` desde el origen de la aplicación ejecutaría scripts con
 * la sesión de quien lo abra. Solo los tipos de esta lista se muestran en el navegador; el
 * resto se descarga como binario.
 */
const INLINE_SAFE_TYPES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/bmp',
	'image/tiff',
	'application/pdf',
	'text/plain',
	'video/mp4',
	'video/webm',
	'video/ogg',
	'audio/mpeg',
	'audio/mp4',
	'audio/ogg',
	'audio/wav',
	'audio/webm',
	'audio/aac',
	'audio/flac'
]);

/**
 * Tipos que conservan su `Content-Type` para poder usarse como `<img src>`, pero que nunca se
 * abren como documento: se descargan y llevan una CSP con `sandbox`.
 */
const EMBED_ONLY_TYPES = new Set(['image/svg+xml']);

const SANDBOX_CSP =
	"sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'";

export interface FileResponseInput {
	mimeType: string | null | undefined;
	fileName: string;
	visibility: string | null | undefined;
	forceDownload?: boolean;
}

function normalizeMimeType(mimeType: string | null | undefined): string {
	return (mimeType ?? '').split(';')[0].trim().toLowerCase();
}

/** `Content-Disposition` con alternativa ASCII y nombre UTF-8 según RFC 6266 / RFC 5987. */
export function buildContentDisposition(type: 'inline' | 'attachment', fileName: string): string {
	const cleaned = fileName.replace(/[\r\n]/g, ' ').trim() || 'file';
	const asciiFallback = cleaned.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	const encoded = encodeURIComponent(cleaned).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/** `Cache-Control` según visibilidad: solo lo público puede guardarse en cachés compartidas. */
export function buildFileCacheControl(visibility: string | null | undefined): string {
	return visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-cache';
}

export function buildFileResponseHeaders(input: FileResponseInput): Headers {
	const mimeType = normalizeMimeType(input.mimeType);
	const inlineSafe = INLINE_SAFE_TYPES.has(mimeType);
	const embedOnly = EMBED_ONLY_TYPES.has(mimeType);
	const headers = new Headers();

	headers.set(
		'Content-Type',
		inlineSafe || embedOnly
			? mimeType === 'text/plain'
				? 'text/plain; charset=utf-8'
				: mimeType
			: 'application/octet-stream'
	);
	headers.set(
		'Content-Disposition',
		buildContentDisposition(
			inlineSafe && !input.forceDownload ? 'inline' : 'attachment',
			input.fileName
		)
	);
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	headers.set('Cache-Control', buildFileCacheControl(input.visibility));
	// El visor de PDF de Chromium no funciona dentro de un documento con `sandbox`.
	if (mimeType !== 'application/pdf') {
		headers.set('Content-Security-Policy', SANDBOX_CSP);
	}

	return headers;
}
