import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

export const LTI_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';

export function isLtiEnabled(): boolean {
	return env.LTI_ENABLED === 'true';
}

export function getLtiToolName(): string {
	return env.LTI_TOOL_NAME || 'Sapin';
}

export function getTrustedLtiOrigins(): string[] {
	return (env.LTI_TRUSTED_ORIGINS || '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
}

export function shouldUseSameSiteNoneCookies(): boolean {
	return env.LTI_COOKIE_SAMESITE_NONE === 'true';
}

export function shouldUseSecureLtiCookies(): boolean {
	if (env.LTI_COOKIE_SECURE === 'false') return false;
	return env.LTI_COOKIE_SECURE === 'true' || !dev;
}

export function getPublicOrigin(requestUrl: URL): string {
	const configuredOrigin = env.ORIGIN?.trim();
	return configuredOrigin || requestUrl.origin;
}

export function buildToolUrl(requestUrl: URL, path: string): string {
	return new URL(path, getPublicOrigin(requestUrl)).toString();
}
