import test from 'node:test';
import assert from 'node:assert/strict';

import { applySecurityHeaders } from './securityHeaders';

test('añade las cabeceras base y HSTS solo sobre HTTPS', () => {
	const http = new Headers();
	applySecurityHeaders(http, { isHttps: false });
	assert.equal(http.get('X-Content-Type-Options'), 'nosniff');
	assert.equal(http.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
	assert.match(http.get('Permissions-Policy') ?? '', /camera=\(\)/);
	assert.equal(http.get('Strict-Transport-Security'), null);

	const https = new Headers();
	applySecurityHeaders(https, { isHttps: true });
	assert.match(https.get('Strict-Transport-Security') ?? '', /^max-age=\d+$/);
});

test('no pisa cabeceras que la respuesta ya definió', () => {
	const headers = new Headers({ 'Referrer-Policy': 'no-referrer' });
	applySecurityHeaders(headers, { isHttps: true });
	assert.equal(headers.get('Referrer-Policy'), 'no-referrer');
});
