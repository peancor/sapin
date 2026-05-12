import { exportJWK, generateKeyPair, importJWK, type JWK } from 'jose';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

const DEFAULT_ALGORITHM = 'RS256';

export type PublicJwks = {
	keys: JWK[];
};

export async function ensureActiveToolKey(): Promise<table.LtiToolKey> {
	const [existing] = await db
		.select()
		.from(table.ltiToolKey)
		.where(eq(table.ltiToolKey.status, table.ltiToolKeyStatus.ACTIVE))
		.limit(1);

	if (existing) return existing;

	const now = new Date();
	const kid = `sapin-lti-${nanoid(12)}`;
	const { publicKey, privateKey } = await generateKeyPair(DEFAULT_ALGORITHM, { extractable: true });
	const publicJwk = await exportJWK(publicKey);
	const privateJwk = await exportJWK(privateKey);

	const key: typeof table.ltiToolKey.$inferInsert = {
		id: nanoid(),
		kid,
		publicJwk: { ...publicJwk, kid, alg: DEFAULT_ALGORITHM, use: 'sig' },
		privateJwk: { ...privateJwk, kid, alg: DEFAULT_ALGORITHM, use: 'sig' },
		algorithm: DEFAULT_ALGORITHM,
		status: table.ltiToolKeyStatus.ACTIVE,
		createdAt: now,
		activatedAt: now
	};

	await db.insert(table.ltiToolKey).values(key);
	return key as table.LtiToolKey;
}

export async function getPublicJwks(): Promise<PublicJwks> {
	const keys = await db
		.select()
		.from(table.ltiToolKey)
		.where(eq(table.ltiToolKey.status, table.ltiToolKeyStatus.ACTIVE));

	if (keys.length === 0) {
		const key = await ensureActiveToolKey();
		return { keys: [sanitizePublicJwk(key.publicJwk, key.kid, key.algorithm)] };
	}

	return {
		keys: keys.map((key) => sanitizePublicJwk(key.publicJwk, key.kid, key.algorithm))
	};
}

export async function getActiveSigningKey() {
	const activeKey = await ensureActiveToolKey();
	const key = await importJWK(activeKey.privateJwk as JWK, activeKey.algorithm);
	return {
		key,
		kid: activeKey.kid,
		algorithm: activeKey.algorithm
	};
}

export function sanitizePublicJwk(
	jwk: Record<string, unknown>,
	kid: string,
	algorithm: string
): JWK {
	const { d, p, q, dp, dq, qi, oth, ...publicOnly } = jwk;
	void d;
	void p;
	void q;
	void dp;
	void dq;
	void qi;
	void oth;

	return {
		...publicOnly,
		kid,
		alg: algorithm,
		use: 'sig'
	} as JWK;
}
