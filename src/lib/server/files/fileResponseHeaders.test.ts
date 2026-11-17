import test from 'node:test';
import assert from 'node:assert/strict';

import {
	buildContentDisposition,
	buildFileCacheControl,
	buildFileResponseHeaders
} from './fileResponseHeaders';

test('los tipos activos nunca se sirven inline ni con su tipo declarado', () => {
	for (const mimeType of [
		'text/html',
		'TEXT/HTML; charset=utf-8',
		'application/xhtml+xml',
		'text/xml',
		'application/javascript',
		'text/css',
		'',
		null
	]) {
		const headers = buildFileResponseHeaders({
			mimeType,
			fileName: 'payload.html',
			visibility: 'private'
		});
		assert.equal(headers.get('Content-Type'), 'application/octet-stream', String(mimeType));
		assert.match(headers.get('Content-Disposition') ?? '', /^attachment;/, String(mimeType));
		assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
		assert.match(headers.get('Content-Security-Policy') ?? '', /^sandbox;/);
	}
});

test('SVG conserva su tipo para <img>, pero se descarga y queda en sandbox', () => {
	const headers = buildFileResponseHeaders({
		mimeType: 'image/svg+xml',
		fileName: 'diagrama.svg',
		visibility: 'public'
	});
	assert.equal(headers.get('Content-Type'), 'image/svg+xml');
	assert.match(headers.get('Content-Disposition') ?? '', /^attachment;/);
	assert.match(headers.get('Content-Security-Policy') ?? '', /^sandbox;/);
});

test('imágenes rasterizadas y texto plano se muestran inline con nosniff', () => {
	const image = buildFileResponseHeaders({
		mimeType: 'image/png',
		fileName: 'foto.png',
		visibility: 'private'
	});
	assert.equal(image.get('Content-Type'), 'image/png');
	assert.match(image.get('Content-Disposition') ?? '', /^inline;/);
	assert.equal(image.get('X-Content-Type-Options'), 'nosniff');

	const text = buildFileResponseHeaders({
		mimeType: 'text/plain',
		fileName: 'notas.txt',
		visibility: 'private'
	});
	assert.equal(text.get('Content-Type'), 'text/plain; charset=utf-8');
	assert.match(text.get('Content-Disposition') ?? '', /^inline;/);
});

test('PDF se muestra inline sin sandbox y download fuerza la descarga', () => {
	const inline = buildFileResponseHeaders({
		mimeType: 'application/pdf',
		fileName: 'apuntes.pdf',
		visibility: 'private'
	});
	assert.match(inline.get('Content-Disposition') ?? '', /^inline;/);
	assert.equal(inline.get('Content-Security-Policy'), null);

	const forced = buildFileResponseHeaders({
		mimeType: 'application/pdf',
		fileName: 'apuntes.pdf',
		visibility: 'private',
		forceDownload: true
	});
	assert.match(forced.get('Content-Disposition') ?? '', /^attachment;/);
});

test('solo los ficheros públicos admiten caché compartida', () => {
	assert.equal(buildFileCacheControl('public'), 'public, max-age=31536000, immutable');
	assert.equal(buildFileCacheControl('private'), 'private, no-cache');
	assert.equal(buildFileCacheControl('restricted'), 'private, no-cache');
	assert.equal(buildFileCacheControl(null), 'private, no-cache');
});

test('Content-Disposition escapa comillas, saltos de línea y caracteres no ASCII', () => {
	const value = buildContentDisposition('attachment', 'año "final"\r\nX-Evil: 1.pdf');
	assert.doesNotMatch(value, /[\r\n]/);
	assert.equal(
		value,
		`attachment; filename="a_o _final_  X-Evil: 1.pdf"; filename*=UTF-8''${encodeURIComponent(
			'año "final"  X-Evil: 1.pdf'
		)}`
	);
	// Debe ser un valor de cabecera válido.
	assert.doesNotThrow(() => new Headers({ 'Content-Disposition': value }));
	assert.match(buildContentDisposition('inline', '   '), /filename="file"/);
});
