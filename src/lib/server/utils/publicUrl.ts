import { env } from '$env/dynamic/private';

const LOCAL_DEV_ORIGIN = 'http://localhost:5173';

function normalizeOrigin(url: string): string {
	return url.replace(/\/+$/, '');
}

export function getPublicAppUrl(): string {
	const configuredOrigin = env.ORIGIN?.trim();

	if (!configuredOrigin) {
		return LOCAL_DEV_ORIGIN;
	}

	try {
		const parsed = new URL(configuredOrigin);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return LOCAL_DEV_ORIGIN;
		}
		return normalizeOrigin(parsed.toString());
	} catch {
		return LOCAL_DEV_ORIGIN;
	}
}
