import type { notificationType, notificationPriority } from '$lib/server/db/schema';

// ============================================
// TIPOS DE CONFIGURACIÓN
// ============================================

export type NotificationChannel = 'in_app' | 'email';

export type NotificationTypeKey = (typeof notificationType)[keyof typeof notificationType];
export type NotificationPriorityKey = (typeof notificationPriority)[keyof typeof notificationPriority];

export interface NotificationTypeConfig {
	enabled: boolean;
	channels: NotificationChannel[];
}

export interface NotificationConfig {
	enabled: boolean;
	channels: {
		inApp: {
			enabled: boolean;
			retentionDays: number;
		};
		email: {
			enabled: boolean;
		};
	};
	types: {
		activity_completed: NotificationTypeConfig;
		enrollment: NotificationTypeConfig;
		new_activity: NotificationTypeConfig;
		course_update: NotificationTypeConfig;
		contact_form: NotificationTypeConfig;
		system: NotificationTypeConfig;
		custom: NotificationTypeConfig;
	};
	/** User IDs that receive contact form notifications. If empty, sends to all admins. */
	contactFormRecipients?: string[];
}

// ============================================
// TIPOS DE PAYLOAD
// ============================================

export interface NotificationPayload {
	userId: string;
	type: NotificationTypeKey;
	title: string;
	message: string;
	priority?: NotificationPriorityKey;
	courseId?: string;
	activityId?: string;
	metadata?: Record<string, unknown>;
	channels?: NotificationChannel[];
	expiresAt?: Date;
}

export interface NotificationResult {
	success: boolean;
	notificationId?: string;
	channelResults: {
		channel: NotificationChannel;
		success: boolean;
		error?: string;
	}[];
}

// ============================================
// TIPOS DE CONSULTA
// ============================================

export interface NotificationQueryOptions {
	page?: number;
	limit?: number;
	unreadOnly?: boolean;
	type?: NotificationTypeKey;
	courseId?: string;
}

export interface NotificationRecord {
	id: string;
	userId: string;
	type: NotificationTypeKey;
	title: string;
	message: string;
	priority: NotificationPriorityKey;
	courseId: string | null;
	activityId: string | null;
	courseName?: string | null;
	activityName?: string | null;
	metadata: Record<string, unknown> | null;
	read: boolean;
	readAt: Date | null;
	channels: NotificationChannel[];
	createdAt: Date;
	expiresAt: Date | null;
}

// ============================================
// CONFIGURACIÓN POR DEFECTO
// ============================================

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
	enabled: true,
	channels: {
		inApp: {
			enabled: true,
			retentionDays: 30
		},
		email: {
			enabled: false
		}
	},
	types: {
		activity_completed: {
			enabled: true,
			channels: ['in_app']
		},
		enrollment: {
			enabled: true,
			channels: ['in_app']
		},
		new_activity: {
			enabled: true,
			channels: ['in_app']
		},
		course_update: {
			enabled: true,
			channels: ['in_app']
		},
		contact_form: {
			enabled: true,
			channels: ['in_app', 'email']
		},
		system: {
			enabled: true,
			channels: ['in_app']
		},
		custom: {
			enabled: true,
			channels: ['in_app']
		}
	},
	contactFormRecipients: []
};
