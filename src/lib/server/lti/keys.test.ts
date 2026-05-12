import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('LTI JWKS helpers', () => {
	it('does not expose private RSA members in the public JWK', async () => {
		process.env.DATABASE_URL = process.env.DATABASE_URL || ':memory:';
		const { sanitizePublicJwk } = await import('./keys.ts');
		const publicJwk = sanitizePublicJwk(
			{
				kty: 'RSA',
				n: 'modulus',
				e: 'AQAB',
				d: 'private',
				p: 'private',
				q: 'private',
				dp: 'private',
				dq: 'private',
				qi: 'private'
			},
			'kid-1',
			'RS256'
		);

		assert.equal(publicJwk.kid, 'kid-1');
		assert.equal(publicJwk.alg, 'RS256');
		assert.equal(publicJwk.use, 'sig');
		assert.equal('d' in publicJwk, false);
		assert.equal('p' in publicJwk, false);
		assert.equal('q' in publicJwk, false);
	});
});
