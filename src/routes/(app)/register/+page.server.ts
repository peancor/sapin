import { fail, redirect, isRedirect } from '@sveltejs/kit';
import * as auth from '$lib/server/auth';
import { db, DBUserUtils, InvitationUtils } from '$lib/server/db';
import { sn } from '$lib/server/sn';
import type { Actions, PageServerLoad } from './$types';
import { validateTurnstileToken, getClientIp } from '$lib/server/turnstile';
import { env } from '$env/dynamic/public';

export const load = (async ({ locals, url }) => {
    // Si ya está autenticado, redirigir al dashboard
    if (locals.user) {
        throw redirect(302, '/dashboard');
    }

    // Check if there's an invite code in the URL
    const inviteCode = url.searchParams.get('invite') || '';
    let inviteInfo: { type: string; courseName?: string; welcomeMessage?: string; isValid: boolean } | null = null;

    if (inviteCode) {
        inviteInfo = await InvitationUtils.getInvitePublicInfo(inviteCode);
    }

    return {
        turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY || '',
        inviteCode,
        inviteInfo
    };
}) satisfies PageServerLoad;

export const actions: Actions = {
    register: async (event) => {
        const formData = await event.request.formData();
        const email = formData.get('email');
        const password = formData.get('password');
        const inviteCode = formData.get('inviteCode');
        const turnstileToken = formData.get('cf-turnstile-response')?.toString();

        // Validar Turnstile
        const turnstileResult = await validateTurnstileToken(turnstileToken, getClientIp(event.request));
        if (!turnstileResult.success) {
            return fail(400, { message: 'Por favor, completa la verificación de seguridad.' });
        }

        if (!validateEmail(email)) {
            return fail(400, { message: 'Email inválido' });
        }
        if (!validatePassword(password)) {
            return fail(400, { message: 'La contraseña debe tener entre 6 y 255 caracteres' });
        }
        if (typeof inviteCode !== 'string' || !sn.validateSerialNumber(inviteCode)) {
            return fail(400, { message: 'Código de invitación inválido' });
        }

        try {
            // Validate the invite using the new system
            const inviteRecord = await InvitationUtils.findValidInvite(inviteCode);

            if (!inviteRecord) {
                return fail(400, { message: 'Código de invitación inválido, expirado o ya utilizado' });
            }

            // Check email restriction if any
            if (inviteRecord.email && inviteRecord.email !== email.toString()) {
                return fail(400, { message: 'Este código de invitación está restringido a otro email' });
            }

            // Create user
            const userId = await DBUserUtils.registerUser({
                email: email.toString(),
                password: password.toString(),
                inviteCode: inviteCode.toString()
            });

            // Redeem the invite - this handles course enrollment, role assignment, etc.
            const redeemResult = await InvitationUtils.redeemInvite(inviteCode, userId);
            if (!redeemResult.success) {
                console.warn('Invite redeemed but actions had issues:', redeemResult.error);
            }

            // Create session and login
            const sessionToken = auth.generateSessionToken();
            const session = await auth.createSession(sessionToken, userId);
            auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);

            // Redirigir al dashboard tras registro exitoso
            return redirect(302, '/dashboard');
        } catch (e) {
            if (isRedirect(e)) throw e;
            console.error('Registration error:', e);
            return fail(500, { message: 'Ha ocurrido un error. El email podría estar ya registrado.' });
        }
    }
};

function validatePassword(password: unknown): password is string {
    return typeof password === 'string' &&
        password.length >= 6 &&
        password.length <= 255;
}

function validateEmail(email: unknown): email is string {
    return typeof email === 'string' &&
        email.length > 0 &&
        email.includes('@');
}