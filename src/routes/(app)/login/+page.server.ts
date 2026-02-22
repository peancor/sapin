import { hash, verify } from '@node-rs/argon2';
import { encodeBase32LowerCase } from '@oslojs/encoding';
import { fail, redirect } from '@sveltejs/kit';
import { eq, or } from 'drizzle-orm';
import * as auth from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';
import { auditService, auditAction } from '$lib/server/logging';
import { validateTurnstileToken, getClientIp } from '$lib/server/turnstile';
import { env } from '$env/dynamic/public';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
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
        const turnstileResult = await validateTurnstileToken(turnstileToken, getClientIp(event.request));
        if (!turnstileResult.success) {
            return fail(400, { message: 'Por favor, completa la verificación de seguridad.' });
        }

        if (typeof identifier !== 'string' || typeof password !== 'string') {
            return fail(400, { message: 'Invalid input' });
        }

        // Check only email field
        const [user] = await db
            .select()
            .from(table.user)
            .where(eq(table.user.email, identifier));

        if (!user) {
            // Audit log - login failed (user not found)
            await auditService.log({
                action: auditAction.USER_LOGIN_FAILED,
                details: { email: identifier, reason: 'user_not_found' },
                ipAddress: getClientIP(event.request),
                userAgent: event.request.headers.get('user-agent'),
                severity: 'warning'
            });
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
            return fail(400, { message: 'Invalid credentials' });
        }

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
    },
    register: async (event) => {
        const formData = await event.request.formData();
        const username = formData.get('username');
        const password = formData.get('password');

        if (!validateUsername(username)) {
            return fail(400, { message: 'Invalid username' });
        }
        if (!validatePassword(password)) {
            return fail(400, { message: 'Invalid password' });
        }

        const userId = generateUserId();
        // Argon2 automatically generates and embeds a secure random salt in the hash
        const passwordHash = await hash(password, {
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4,
            outputLen: 32,
        });

        try {
            await db.insert(table.user).values({
                id: userId,
                username,
                passwordHash,
                email: '', // Add appropriate email value
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const sessionToken = auth.generateSessionToken();
            const session = await auth.createSession(sessionToken, userId);
            auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);

            // Audit log - user registered
            await auditService.log({
                action: auditAction.USER_CREATED,
                userId: userId,
                targetType: 'user',
                targetId: userId,
                details: { username, registeredVia: 'self_registration' },
                ipAddress: getClientIP(event.request),
                userAgent: event.request.headers.get('user-agent'),
                severity: 'info'
            });
        } catch (e) {
            return fail(500, { message: 'An error has occurred' });
        }
        return redirect(302, '/dashboard');
    }
};

function generateUserId() {
    // ID with 120 bits of entropy, or about the same as UUID v4.
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    const id = encodeBase32LowerCase(bytes);
    return id;
}

function validateUsername(username: unknown): username is string {
    return (
        typeof username === 'string' &&
        username.length >= 3 &&
        username.length <= 31 &&
        /^[a-z0-9_-]+$/.test(username)
    );
}

function validatePassword(password: unknown): password is string {
    return typeof password === 'string' && password.length >= 6 && password.length <= 255;
}
