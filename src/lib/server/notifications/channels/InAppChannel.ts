import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { nanoid } from 'nanoid';
import type { NotificationPayload, NotificationChannel } from '../NotificationTypes';

export interface InAppChannelResult {
	success: boolean;
	notificationId?: string;
	error?: string;
}

/**
 * Canal de notificaciones In-App
 * Guarda las notificaciones en la base de datos para mostrarlas en la UI
 */
export async function sendInAppNotification(
	payload: NotificationPayload,
	channels: NotificationChannel[]
): Promise<InAppChannelResult> {
	try {
		const notificationId = nanoid();

		await db.insert(notification).values({
			id: notificationId,
			userId: payload.userId,
			type: payload.type,
			title: payload.title,
			message: payload.message,
			priority: payload.priority || 'normal',
			courseId: payload.courseId || null,
			activityId: payload.activityId || null,
			metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
			read: false,
			readAt: null,
			channels: JSON.stringify(channels),
			createdAt: new Date(),
			expiresAt: payload.expiresAt || null
		});

		return {
			success: true,
			notificationId
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('InAppChannel error:', error);
		return {
			success: false,
			error: errorMessage
		};
	}
}
