import { env } from '$env/dynamic/private';

export interface TurnstileValidationResult {
	success: boolean;
	'error-codes'?: string[];
	challenge_ts?: string;
	hostname?: string;
	action?: string;
	cdata?: string;
}

/**
 * Validates a Cloudflare Turnstile token on the server side.
 * 
 * @param token - The turnstile response token from the client
 * @param remoteIp - Optional IP address of the client for additional validation
 * @returns The validation result from Cloudflare
 */
export async function validateTurnstileToken(
	token: string | null | undefined,
	remoteIp?: string | null
): Promise<TurnstileValidationResult> {
	const secretKey = env.TURNSTILE_SECRET_KEY;

	// If no secret key is configured, skip validation (useful for development)
	if (!secretKey) {
		console.warn('TURNSTILE_SECRET_KEY not configured, skipping Turnstile validation');
		return { success: true };
	}

	if (!token) {
		return {
			success: false,
			'error-codes': ['missing-input-response']
		};
	}

	const formData = new URLSearchParams();
	formData.append('secret', secretKey);
	formData.append('response', token);
	if (remoteIp) {
		formData.append('remoteip', remoteIp);
	}

	try {
		const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: formData.toString()
		});

		if (!response.ok) {
			console.error('Turnstile verification request failed:', response.status);
			return {
				success: false,
				'error-codes': ['network-error']
			};
		}

		const result = await response.json() as TurnstileValidationResult;
		return result;
	} catch (error) {
		console.error('Turnstile verification error:', error);
		return {
			success: false,
			'error-codes': ['network-error']
		};
	}
}

/**
 * Helper function to get client IP from request headers
 */
export function getClientIp(request: Request): string | null {
	return (
		request.headers.get('cf-connecting-ip') ||
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		null
	);
}
