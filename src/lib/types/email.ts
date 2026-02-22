/**
 * Email configuration types
 * Designed to be extensible for future providers (e.g., Resend)
 */

export type EmailProvider = 'smtp' | 'resend';

export interface SmtpConfig {
	host: string;
	port: number;
	secure: boolean; // true for 465, false for other ports
	auth: {
		user: string;
		pass: string;
	};
	fromName: string;
	fromEmail: string;
}

export interface ResendConfig {
	apiKey: string;
	fromName: string;
	fromEmail: string;
}

export interface EmailConfig {
	provider: EmailProvider;
	enabled: boolean;
	smtp?: SmtpConfig;
	resend?: ResendConfig;
}

export interface EmailSendOptions {
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	subject: string;
	html?: string;
	text?: string;
	template?: string;
	context?: Record<string, unknown>;
}

export interface EmailSendResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
	provider: 'smtp',
	enabled: false,
	smtp: {
		host: '',
		port: 587,
		secure: false,
		auth: {
			user: '',
			pass: ''
		},
		fromName: '',
		fromEmail: ''
	}
};
