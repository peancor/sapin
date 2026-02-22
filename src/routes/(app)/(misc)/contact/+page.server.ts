import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { notificationService } from '$lib/server/notifications';
import { validateTurnstileToken, getClientIp } from '$lib/server/turnstile';
import { env } from '$env/dynamic/public';

export const load: PageServerLoad = async () => {
	return {
		turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY || ''
	};
};

export const actions = {
	default: async ({ request }) => {
		const data = await request.formData();

		const name = data.get('name')?.toString().trim();
		const email = data.get('email')?.toString().trim();
		const message = data.get('message')?.toString().trim();
		const turnstileToken = data.get('cf-turnstile-response')?.toString();

		// Validar Turnstile
		const turnstileResult = await validateTurnstileToken(turnstileToken, getClientIp(request));
		if (!turnstileResult.success) {
			return fail(400, {
				error: 'Por favor, completa la verificación de seguridad.',
				name,
				email,
				message
			});
		}

		// Validación básica
		if (!name || name.length < 2) {
			return fail(400, {
				error: 'Por favor, introduce tu nombre.',
				name,
				email,
				message
			});
		}

		if (!email || !email.includes('@')) {
			return fail(400, {
				error: 'Por favor, introduce un email válido.',
				name,
				email,
				message
			});
		}

		if (!message || message.length < 10) {
			return fail(400, {
				error: 'Por favor, escribe un mensaje de al menos 10 caracteres.',
				name,
				email,
				message
			});
		}

		try {
			// Enviar notificación a los destinatarios configurados
			const result = await notificationService.notifyContactForm(name, email, message);

			if (!result.success) {
				console.error('Failed to send contact form notification');
				// Aún así devolvemos éxito al usuario para no exponer errores internos
			}

			return {
				success: true,
				message: 'Mensaje enviado correctamente. Te responderemos lo antes posible.'
			};
		} catch (error) {
			console.error('Error processing contact form:', error);
			return fail(500, {
				error: 'Error al enviar el mensaje. Por favor, inténtalo de nuevo.',
				name,
				email,
				message
			});
		}
	}
} satisfies Actions;
