import { getPublicAppUrl } from './publicUrl';

export function buildOpenRouterHeaders(apiKey: string, title: string): HeadersInit {
	return {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json',
		'HTTP-Referer': getPublicAppUrl(),
		'X-Title': title
	};
}
