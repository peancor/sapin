// Servicio principal
export { notificationService } from './NotificationService';

// Tipos
export type {
	NotificationConfig,
	NotificationPayload,
	NotificationResult,
	NotificationQueryOptions,
	NotificationRecord,
	NotificationChannel,
	NotificationTypeKey,
	NotificationPriorityKey,
	NotificationTypeConfig
} from './NotificationTypes';

export { DEFAULT_NOTIFICATION_CONFIG } from './NotificationTypes';

// Canales (para uso interno principalmente)
export { sendInAppNotification } from './channels/InAppChannel';
export { sendEmailNotification } from './channels/EmailChannel';
