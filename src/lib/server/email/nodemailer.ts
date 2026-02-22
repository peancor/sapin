import nodemailer from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

// Lazy-initialized transporter (deprecated - use EmailService instead)
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
	if (!transporter) {
		// This is a legacy fallback - SMTP should be configured via admin settings
		transporter = nodemailer.createTransport({
			host: '127.0.0.1',
			port: 3535,
			auth: {
				user: '',
				pass: ''
			}
		});
	}
	return transporter;
}

// Interfaz para los datos del email
export interface EmailData {
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	subject: string;
	template: string;
	context: Record<string, any>;
}

// Función para cargar y compilar plantilla
function getCompiledTemplate(templateName: string): HandlebarsTemplateDelegate {
	const templatePath = join(
		process.cwd(),
		'src',
		'lib',
		'server',
		'email',
		'templates',
		`${templateName}.hbs`
	);
	const templateContent = readFileSync(templatePath, 'utf-8');
	return Handlebars.compile(templateContent);
}

// Función principal para enviar emails
// @deprecated Use EmailService instead - this is kept for backwards compatibility
export async function sendEmail(emailData: EmailData): Promise<boolean> {
	try {
		// Cargar y compilar la plantilla
		const template = getCompiledTemplate(emailData.template);

		// Generar el HTML con los datos del contexto
		const html = template(emailData.context);

		// Configurar las opciones del email
		const mailOptions: SendMailOptions = {
			from: 'noreply@localhost',
			to: emailData.to,
			cc: emailData.cc,
			bcc: emailData.bcc,
			subject: emailData.subject,
			html
		};

		// Enviar el email
		await getTransporter().sendMail(mailOptions);
		return true;
	} catch (error) {
		console.error('Error sending email:', error);
		return false;
	}
}
