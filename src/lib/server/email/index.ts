// Email Service exports
export { emailService } from './EmailService';
export type {
	EmailConfig,
	EmailSendOptions,
	EmailSendResult,
	EmailProvider,
	SmtpConfig,
	ResendConfig
} from '$lib/types/email';
export { DEFAULT_EMAIL_CONFIG } from '$lib/types/email';
