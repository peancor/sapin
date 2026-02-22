import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { db } from '$lib/server/db';
import { appSetting } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
	EmailConfig,
	EmailSendOptions,
	EmailSendResult,
	EmailProvider
} from '$lib/types/email';
import { DEFAULT_EMAIL_CONFIG } from '$lib/types/email';

/**
 * Email Service - Extensible email sending service
 * Currently supports SMTP, designed to be extended for Resend and other providers
 */
class EmailService {
	private config: EmailConfig | null = null;
	private smtpTransporter: Transporter | null = null;
	private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

	/**
	 * Load email configuration from database
	 */
	async loadConfig(): Promise<EmailConfig> {
		try {
			const result = await db
				.select()
				.from(appSetting)
				.where(eq(appSetting.key, 'emailConfig'));

			if (result[0]?.value) {
				this.config = JSON.parse(result[0].value) as EmailConfig;
			} else {
				this.config = DEFAULT_EMAIL_CONFIG;
			}

			// Initialize transporter based on provider
			if (this.config.enabled) {
				await this.initializeProvider();
			}

			return this.config;
		} catch (error) {
			console.error('Error loading email config:', error);
			this.config = DEFAULT_EMAIL_CONFIG;
			return this.config;
		}
	}

	/**
	 * Save email configuration to database
	 */
	async saveConfig(config: EmailConfig): Promise<boolean> {
		try {
			const existing = await db
				.select()
				.from(appSetting)
				.where(eq(appSetting.key, 'emailConfig'));

			const configJson = JSON.stringify(config);

			if (existing.length > 0) {
				await db
					.update(appSetting)
					.set({ value: configJson })
					.where(eq(appSetting.key, 'emailConfig'));
			} else {
				const { nanoid } = await import('nanoid');
				await db.insert(appSetting).values({
					id: nanoid(),
					key: 'emailConfig',
					value: configJson,
					createdAt: new Date()
				});
			}

			this.config = config;

			// Re-initialize provider if enabled
			if (config.enabled) {
				await this.initializeProvider();
			} else {
				this.smtpTransporter = null;
			}

			return true;
		} catch (error) {
			console.error('Error saving email config:', error);
			return false;
		}
	}

	/**
	 * Get current configuration
	 */
	async getConfig(): Promise<EmailConfig> {
		if (!this.config) {
			await this.loadConfig();
		}
		return this.config ?? DEFAULT_EMAIL_CONFIG;
	}

	/**
	 * Initialize the email provider based on configuration
	 */
	private async initializeProvider(): Promise<void> {
		if (!this.config) return;

		switch (this.config.provider) {
			case 'smtp':
				this.initializeSmtp();
				break;
			case 'resend':
				// Future: Initialize Resend client
				console.log('Resend provider not yet implemented');
				break;
		}
	}

	/**
	 * Initialize SMTP transporter
	 */
	private initializeSmtp(): void {
		if (!this.config?.smtp) return;

		const { host, port, secure, auth } = this.config.smtp;

		this.smtpTransporter = nodemailer.createTransport({
			host,
			port,
			secure,
			auth: {
				user: auth.user,
				pass: auth.pass
			}
		});
	}

	/**
	 * Load and compile a Handlebars template
	 */
	private getCompiledTemplate(templateName: string): HandlebarsTemplateDelegate | null {
		// Check cache first
		if (this.templateCache.has(templateName)) {
			return this.templateCache.get(templateName)!;
		}

		const templatePath = join(
			process.cwd(),
			'src',
			'lib',
			'server',
			'email',
			'templates',
			`${templateName}.hbs`
		);

		if (!existsSync(templatePath)) {
			console.error(`Template not found: ${templatePath}`);
			return null;
		}

		try {
			const templateContent = readFileSync(templatePath, 'utf-8');
			const compiled = Handlebars.compile(templateContent);
			this.templateCache.set(templateName, compiled);
			return compiled;
		} catch (error) {
			console.error(`Error compiling template ${templateName}:`, error);
			return null;
		}
	}

	/**
	 * Send an email
	 */
	async send(options: EmailSendOptions): Promise<EmailSendResult> {
		// Ensure config is loaded
		const config = await this.getConfig();

		if (!config.enabled) {
			return {
				success: false,
				error: 'Email service is not enabled'
			};
		}

		// Generate HTML from template if provided
		let html = options.html;
		if (options.template && options.context) {
			const template = this.getCompiledTemplate(options.template);
			if (template) {
				html = template(options.context);
			} else {
				return {
					success: false,
					error: `Template "${options.template}" not found`
				};
			}
		}

		// Send based on provider
		switch (config.provider) {
			case 'smtp':
				return this.sendViaSmtp(options, html);
			case 'resend':
				return this.sendViaResend(options, html);
			default:
				return {
					success: false,
					error: `Unknown provider: ${config.provider}`
				};
		}
	}

	/**
	 * Send email via SMTP
	 */
	private async sendViaSmtp(
		options: EmailSendOptions,
		html?: string
	): Promise<EmailSendResult> {
		if (!this.smtpTransporter || !this.config?.smtp) {
			return {
				success: false,
				error: 'SMTP transporter not initialized'
			};
		}

		const { fromName, fromEmail } = this.config.smtp;

		const mailOptions: SendMailOptions = {
			from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
			to: options.to,
			cc: options.cc,
			bcc: options.bcc,
			subject: options.subject,
			html: html,
			text: options.text
		};

		try {
			const result = await this.smtpTransporter.sendMail(mailOptions);
			return {
				success: true,
				messageId: result.messageId
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error('SMTP send error:', error);
			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Send email via Resend (placeholder for future implementation)
	 */
	private async sendViaResend(
		options: EmailSendOptions,
		html?: string
	): Promise<EmailSendResult> {
		// Future: Implement Resend sending
		return {
			success: false,
			error: 'Resend provider not yet implemented'
		};
	}

	/**
	 * Test the email connection/configuration
	 */
	async testConnection(): Promise<EmailSendResult> {
		const config = await this.getConfig();

		if (!config.enabled) {
			return {
				success: false,
				error: 'Email service is not enabled'
			};
		}

		switch (config.provider) {
			case 'smtp':
				return this.testSmtpConnection();
			case 'resend':
				return {
					success: false,
					error: 'Resend test not yet implemented'
				};
			default:
				return {
					success: false,
					error: `Unknown provider: ${config.provider}`
				};
		}
	}

	/**
	 * Test SMTP connection
	 */
	private async testSmtpConnection(): Promise<EmailSendResult> {
		if (!this.smtpTransporter) {
			// Try to initialize
			this.initializeSmtp();
		}

		if (!this.smtpTransporter) {
			return {
				success: false,
				error: 'SMTP transporter not initialized'
			};
		}

		try {
			await this.smtpTransporter.verify();
			return {
				success: true,
				messageId: 'Connection verified'
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Send a test email
	 */
	async sendTestEmail(to: string): Promise<EmailSendResult> {
		const config = await this.getConfig();

		return this.send({
			to,
			subject: 'SAPIN - Test Email',
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
					<h1 style="color: #2563eb;">¡Configuración de Email Exitosa!</h1>
					<p>Este es un email de prueba desde SAPIN.</p>
					<p>Si recibes este mensaje, la configuración de email está funcionando correctamente.</p>
					<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
					<p style="color: #6b7280; font-size: 12px;">
						Proveedor: ${config.provider.toUpperCase()}<br>
						Enviado: ${new Date().toLocaleString('es-ES')}
					</p>
				</div>
			`
		});
	}
}

// Export singleton instance
export const emailService = new EmailService();
