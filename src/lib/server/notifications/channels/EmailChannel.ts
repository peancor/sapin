import { emailService } from '$lib/server/email/EmailService';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { NotificationPayload } from '../NotificationTypes';

export interface EmailChannelResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

/**
 * Canal de notificaciones por Email
 * Usa el EmailService existente para enviar notificaciones
 */
export async function sendEmailNotification(
	payload: NotificationPayload
): Promise<EmailChannelResult> {
	try {
		// Obtener el email del usuario
		const userData = await db
			.select({ email: user.email, username: user.username })
			.from(user)
			.where(eq(user.id, payload.userId))
			.limit(1);

		if (!userData[0]?.email) {
			return {
				success: false,
				error: 'User email not found'
			};
		}

		const { email, username } = userData[0];

		// Generar HTML para el email
		const html = generateEmailHtml(payload, username || 'Usuario');

		// Enviar usando EmailService
		const result = await emailService.send({
			to: email,
			subject: `SAPIN - ${payload.title}`,
			html
		});

		return {
			success: result.success,
			messageId: result.messageId,
			error: result.error
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('EmailChannel error:', error);
		return {
			success: false,
			error: errorMessage
		};
	}
}

/**
 * Genera el HTML del email de notificación
 */
function generateEmailHtml(payload: NotificationPayload, username: string): string {
	const priorityColors: Record<string, { bg: string; text: string }> = {
		low: { bg: '#e5e7eb', text: '#374151' },
		normal: { bg: '#dbeafe', text: '#1e40af' },
		high: { bg: '#fef3c7', text: '#92400e' },
		urgent: { bg: '#fee2e2', text: '#991b1b' }
	};

	const priority = payload.priority || 'normal';
	const colors = priorityColors[priority];

	return `
		<!DOCTYPE html>
		<html lang="es">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
		</head>
		<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
			<table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
				<tr>
					<td style="padding: 40px 30px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);">
						<h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">
							SAPIN
						</h1>
					</td>
				</tr>
				<tr>
					<td style="padding: 30px;">
						<p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
							Hola <strong>${username}</strong>,
						</p>

						<div style="background-color: ${colors.bg}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
							<h2 style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 18px; font-weight: bold;">
								${payload.title}
							</h2>
							<p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
								${payload.message}
							</p>
						</div>

						<p style="margin: 0; color: #6b7280; font-size: 14px;">
							Puedes ver más detalles en tu panel de notificaciones.
						</p>
					</td>
				</tr>
				<tr>
					<td style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
						<p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
							Este es un mensaje automático de SAPIN. Por favor no respondas a este correo.
						</p>
					</td>
				</tr>
			</table>
		</body>
		</html>
	`;
}
