import { verify } from '@node-rs/argon2';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import * as auth from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';
import { auditService, auditAction } from '$lib/server/logging';
import { validateTurnstileToken, getClientIp } from '$lib/server/turnstile';
import { env } from '$env/dynamic/public';
import { AttemptLimiter } from '$lib/server/rateLimit';

// Intentos fallidos permitidos en 15 minutos: por IP+cuenta y por IP (esta última es amplia
// porque un aula o un proxy pueden compartir dirección).
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const accountLimiter = new AttemptLimiter(10, LOGIN_WINDOW_MS);
const ipLimiter = new AttemptLimiter(100, LOGIN_WINDOW_MS);

function getLimiterAddress(event: { getClientAddress: () => string }): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

function getClientIP(request: Request): string | null {
	return (
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		null
	);
}

export const load = (async ({ locals }) => {
	// Si ya está autenticado, redirigir al dashboard
	if (locals.user) {
		throw redirect(302, '/dashboard');
	}
	return {
		turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY || ''
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	login: async (event) => {
		const formData = await event.request.formData();
		const identifier = formData.get('identifier');
		const password = formData.get('password');
		const turnstileToken = formData.get('cf-turnstile-response')?.toString();

		// Validar Turnstile
		const turnstileResult = await validateTurnstileToken(
			turnstileToken,
			getClientIp(event.request)
		);
		if (!turnstileResult.success) {
			return fail(400, { message: 'Por favor, completa la verificación de seguridad.' });
		}

		if (typeof identifier !== 'string' || typeof password !== 'string') {
			return fail(400, { message: 'Invalid input' });
		}

		const address = getLimiterAddress(event);
		const ipKey = `ip:${address}`;
		const accountKey = `account:${address}:${identifier.trim().toLowerCase()}`;
		const limit = [ipLimiter.check(ipKey), accountLimiter.check(accountKey)].find(
			(status) => status.limited
		);
		if (limit) {
			await auditService.log({
				action: auditAction.USER_LOGIN_FAILED,
				details: { email: identifier, reason: 'rate_limited' },
				ipAddress: getClientIP(event.request),
				userAgent: event.request.headers.get('user-agent'),
				severity: 'warning'
			});
			const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
			return fail(429, {
				message: `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutes} min.`
			});
		}

		// Check only email field
		const [user] = await db.select().from(table.user).where(eq(table.user.email, identifier));

		if (!user) {
			// Audit log - login failed (user not found)
			await auditService.log({
				action: auditAction.USER_LOGIN_FAILED,
				details: { email: identifier, reason: 'user_not_found' },
				ipAddress: getClientIP(event.request),
				userAgent: event.request.headers.get('user-agent'),
				severity: 'warning'
			});
			ipLimiter.hit(ipKey);
			accountLimiter.hit(accountKey);
			return fail(400, { message: 'Invalid credentials' });
		}

		// Argon2 extracts the salt from the encoded hash automatically
		const isValidPassword = await verify(user.passwordHash, password);

		if (!isValidPassword) {
			// Audit log - login failed (wrong password)
			await auditService.log({
				action: auditAction.USER_LOGIN_FAILED,
				userId: user.id,
				details: { email: identifier, reason: 'invalid_password' },
				ipAddress: getClientIP(event.request),
				userAgent: event.request.headers.get('user-agent'),
				severity: 'warning'
			});
			ipLimiter.hit(ipKey);
			accountLimiter.hit(accountKey);
			return fail(400, { message: 'Invalid credentials' });
		}

		accountLimiter.reset(accountKey);

		const sessionToken = auth.generateSessionToken();
		const session = await auth.createSession(sessionToken, user.id);
		auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);

		// Audit log - login successful
		await auditService.log({
			action: auditAction.USER_LOGIN,
			userId: user.id,
			ipAddress: getClientIP(event.request),
			userAgent: event.request.headers.get('user-agent'),
			severity: 'info'
		});

		// Redirigir al dashboard tras login exitoso
		return redirect(302, '/dashboard');
	}
};
