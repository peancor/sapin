import { db } from '$lib/server/db';
import {
	notification,
	appSetting,
	course,
	interactiveLearning,
	user,
	courseRole,
	auditAction
} from '$lib/server/db/schema';
import { eq, desc, and, lte, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sendInAppNotification } from './channels/InAppChannel';
import { sendEmailNotification } from './channels/EmailChannel';
import { auditService } from '$lib/server/logging/AuditService';
import type {
	NotificationConfig,
	NotificationPayload,
	NotificationResult,
	NotificationQueryOptions,
	NotificationRecord,
	NotificationChannel,
	NotificationTypeKey,
	NotificationPriorityKey
} from './NotificationTypes';
import { DEFAULT_NOTIFICATION_CONFIG } from './NotificationTypes';

// ============================================
// SERVICIO DE NOTIFICACIONES
// ============================================

class NotificationService {
	private configCache: NotificationConfig | null = null;
	private configCacheTime: number = 0;
	private readonly CACHE_TTL = 60000; // 1 minuto

	// ============================================
	// CONFIGURACIÓN
	// ============================================

	/**
	 * Obtiene la configuración del sistema de notificaciones
	 */
	async getConfig(): Promise<NotificationConfig> {
		// Cache simple para evitar consultas repetidas
		if (this.configCache && Date.now() - this.configCacheTime < this.CACHE_TTL) {
			return this.configCache;
		}

		try {
			const result = await db
				.select()
				.from(appSetting)
				.where(eq(appSetting.key, 'notificationConfig'));

			if (result[0]?.value) {
				this.configCache = JSON.parse(result[0].value) as NotificationConfig;
			} else {
				this.configCache = DEFAULT_NOTIFICATION_CONFIG;
			}

			this.configCacheTime = Date.now();
			return this.configCache;
		} catch (error) {
			console.error('Error loading notification config:', error);
			return DEFAULT_NOTIFICATION_CONFIG;
		}
	}

	/**
	 * Guarda la configuración del sistema de notificaciones
	 */
	async saveConfig(config: Partial<NotificationConfig>, userId?: string): Promise<void> {
		// Merge con config existente
		const currentConfig = await this.getConfig();
		const newConfig = { ...currentConfig, ...config };

		const configJson = JSON.stringify(newConfig);

		const existing = await db
			.select()
			.from(appSetting)
			.where(eq(appSetting.key, 'notificationConfig'));

		if (existing.length > 0) {
			await db
				.update(appSetting)
				.set({ value: configJson })
				.where(eq(appSetting.key, 'notificationConfig'));
		} else {
			await db.insert(appSetting).values({
				id: nanoid(),
				key: 'notificationConfig',
				value: configJson,
				createdAt: new Date()
			});
		}

		// Invalidar cache
		this.configCache = null;

		// Registrar en auditoría (sin datos sensibles)
		await auditService.log({
			action: auditAction.NOTIFICATION_CONFIG_UPDATED,
			userId: userId || null,
			targetType: 'notification_config',
			details: {
				enabled: newConfig.enabled,
				channelsEnabled: {
					inApp: newConfig.channels.inApp.enabled,
					email: newConfig.channels.email.enabled
				}
			}
		});
	}

	// ============================================
	// MÉTODO PRINCIPAL DE NOTIFICACIÓN
	// ============================================

	/**
	 * Envía una notificación a través de los canales configurados
	 */
	async notify(payload: NotificationPayload): Promise<NotificationResult> {
		const config = await this.getConfig();

		// Verificar si está habilitado globalmente
		if (!config.enabled) {
			return {
				success: false,
				channelResults: []
			};
		}

		// Verificar si el tipo de notificación está habilitado
		const typeConfig = config.types[payload.type as keyof typeof config.types];
		if (!typeConfig?.enabled) {
			return {
				success: false,
				channelResults: []
			};
		}

		// Determinar canales a usar
		const channels = payload.channels || typeConfig.channels;
		const channelResults: NotificationResult['channelResults'] = [];
		let notificationId: string | undefined;

		// Enviar por cada canal habilitado
		for (const channel of channels) {
			if (channel === 'in_app' && config.channels.inApp.enabled) {
				const result = await sendInAppNotification(payload, channels);
				notificationId = result.notificationId;
				channelResults.push({
					channel: 'in_app',
					success: result.success,
					error: result.error
				});
			}

			if (channel === 'email' && config.channels.email.enabled) {
				const result = await sendEmailNotification(payload);
				channelResults.push({
					channel: 'email',
					success: result.success,
					error: result.error
				});
			}
		}

		const result = {
			success: channelResults.some((r) => r.success),
			notificationId,
			channelResults
		};

		// Registrar en auditoría (solo metadatos, no contenido del mensaje)
		await auditService.log({
			action: auditAction.NOTIFICATION_SENT,
			userId: null, // Sistema
			targetType: 'notification',
			targetId: notificationId,
			details: {
				recipientId: payload.userId,
				type: payload.type,
				priority: payload.priority || 'normal',
				channels: channels,
				courseId: payload.courseId || null,
				activityId: payload.activityId || null,
				success: result.success,
				channelResults: channelResults.map((cr) => ({
					channel: cr.channel,
					success: cr.success
				}))
			}
		});

		return result;
	}

	// ============================================
	// MÉTODOS ESPECÍFICOS POR EVENTO
	// ============================================

	/**
	 * Notifica cuando un estudiante completa una actividad
	 * Envía notificación a los profesores del curso
	 */
	async notifyActivityCompleted(
		studentId: string,
		courseId: string,
		activityId: string
	): Promise<void> {
		try {
			const { inArray } = await import('drizzle-orm');

			// Obtener datos del estudiante, curso, actividad y profesores (usando courseRole)
			const [studentData, courseData, activityData, teachers] = await Promise.all([
				db.select({ username: user.username }).from(user).where(eq(user.id, studentId)).limit(1),
				db.select({ name: course.name }).from(course).where(eq(course.id, courseId)).limit(1),
				db
					.select({ name: interactiveLearning.name })
					.from(interactiveLearning)
					.where(eq(interactiveLearning.id, activityId))
					.limit(1),
				db.select({ userId: courseRole.userId })
					.from(courseRole)
					.where(
						and(
							eq(courseRole.courseId, courseId),
							eq(courseRole.isActive, true),
							inArray(courseRole.role, ['owner', 'admin', 'teacher'])
						)
					)
			]);

			const studentName = studentData[0]?.username || 'Un estudiante';
			const courseName = courseData[0]?.name || 'el curso';
			const activityName = activityData[0]?.name || 'una actividad';

			// Notificar a cada profesor del curso
			for (const teacher of teachers) {
				await this.notify({
					userId: teacher.userId,
					type: 'activity_completed',
					title: 'Actividad completada',
					message: `${studentName} ha completado "${activityName}" en ${courseName}`,
					priority: 'normal',
					courseId,
					activityId,
					metadata: { studentId, studentName }
				});
			}
		} catch (error) {
			console.error('Error notifying activity completed:', error);
		}
	}

	/**
	 * Notifica cuando un usuario se inscribe en un curso
	 */
	async notifyEnrollment(studentId: string, courseId: string): Promise<void> {
		try {
			// Obtener datos del curso
			const courseData = await db
				.select({ name: course.name })
				.from(course)
				.where(eq(course.id, courseId))
				.limit(1);

			const courseName = courseData[0]?.name || 'el curso';

			// Notificar al estudiante
			await this.notify({
				userId: studentId,
				type: 'enrollment',
				title: 'Inscripción exitosa',
				message: `Te has inscrito correctamente en "${courseName}". ¡Comienza a aprender!`,
				priority: 'normal',
				courseId
			});
		} catch (error) {
			console.error('Error notifying enrollment:', error);
		}
	}

	/**
	 * Notifica sobre una nueva actividad en el curso
	 * Envía notificación a todos los estudiantes del curso
	 */
	async notifyNewActivity(courseId: string, activityId: string): Promise<void> {
		try {
			// Obtener datos del curso, actividad y estudiantes (usando courseRole)
			const [courseData, activityData, students] = await Promise.all([
				db.select({ name: course.name }).from(course).where(eq(course.id, courseId)).limit(1),
				db
					.select({ name: interactiveLearning.name })
					.from(interactiveLearning)
					.where(eq(interactiveLearning.id, activityId))
					.limit(1),
				db.select({ userId: courseRole.userId })
					.from(courseRole)
					.where(
						and(
							eq(courseRole.courseId, courseId),
							eq(courseRole.isActive, true),
							eq(courseRole.role, 'student')
						)
					)
			]);

			const courseName = courseData[0]?.name || 'el curso';
			const activityName = activityData[0]?.name || 'una nueva actividad';

			// Notificar a cada estudiante del curso
			for (const student of students) {
				await this.notify({
					userId: student.userId,
					type: 'new_activity',
					title: 'Nueva actividad disponible',
					message: `Se ha agregado "${activityName}" en ${courseName}`,
					priority: 'normal',
					courseId,
					activityId
				});
			}

			// Registrar notificación masiva en auditoría
			if (students.length > 0) {
				await auditService.log({
					action: auditAction.NOTIFICATION_BULK_SENT,
					userId: null,
					targetType: 'course',
					targetId: courseId,
					details: {
						type: 'new_activity',
						recipientCount: students.length,
						activityId
					}
				});
			}
		} catch (error) {
			console.error('Error notifying new activity:', error);
		}
	}

	/**
	 * Notifica sobre un mensaje del formulario de contacto
	 * Envía notificación a los destinatarios configurados o a todos los administradores
	 */
	async notifyContactForm(
		fromName: string,
		fromEmail: string,
		message: string
	): Promise<{ success: boolean; recipientCount: number }> {
		try {
			const config = await this.getConfig();

			// Verificar si las notificaciones de contact_form están habilitadas
			if (!config.enabled || !config.types.contact_form.enabled) {
				return { success: false, recipientCount: 0 };
			}

			let recipientIds: string[] = [];

			// Usar destinatarios configurados o buscar administradores
			if (config.contactFormRecipients && config.contactFormRecipients.length > 0) {
				recipientIds = config.contactFormRecipients;
			} else {
				// Fallback: obtener administradores (nivel >= 90)
				const { role, userRoleAssignment } = await import('$lib/server/db/schema');
				const { gte } = await import('drizzle-orm');

				const admins = await db
					.select({ userId: userRoleAssignment.userId })
					.from(userRoleAssignment)
					.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
					.where(
						and(
							eq(userRoleAssignment.isActive, true),
							eq(role.isActive, true),
							gte(role.level, 90)
						)
					);

				recipientIds = [...new Set(admins.map((a) => a.userId))];
			}

			if (recipientIds.length === 0) {
				console.warn('No recipients found for contact form notification');
				return { success: false, recipientCount: 0 };
			}

			// Enviar notificación a cada destinatario
			let successCount = 0;
			for (const userId of recipientIds) {
				const result = await this.notify({
					userId,
					type: 'contact_form',
					title: 'Nuevo mensaje de contacto',
					message: `De: ${fromName} (${fromEmail})\n\n${message.substring(0, 300)}${message.length > 300 ? '...' : ''}`,
					priority: 'high',
					metadata: { fromName, fromEmail, fullMessage: message }
				});
				if (result.success) successCount++;
			}

			return { success: successCount > 0, recipientCount: successCount };
		} catch (error) {
			console.error('Error notifying contact form:', error);
			return { success: false, recipientCount: 0 };
		}
	}

	/**
	 * Envía una notificación manual a usuarios según sus roles
	 * Para anuncios, novedades, etc.
	 * Optimizado para envíos masivos usando batch insert
	 */
	async sendBroadcast(options: {
		title: string;
		message: string;
		priority?: NotificationPriorityKey;
		roleIds?: string[]; // IDs de roles específicos, null = todos
		channels?: NotificationChannel[];
		senderId?: string; // Admin que envía
	}): Promise<{ success: boolean; recipientCount: number; errors: string[] }> {
		const errors: string[] = [];
		let recipientCount = 0;

		try {
			const { role, userRoleAssignment } = await import('$lib/server/db/schema');
			const { inArray } = await import('drizzle-orm');

			// Obtener usuarios según roles
			let usersQuery;
			if (options.roleIds && options.roleIds.length > 0) {
				usersQuery = db
					.select({ userId: userRoleAssignment.userId })
					.from(userRoleAssignment)
					.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
					.where(
						and(
							eq(userRoleAssignment.isActive, true),
							eq(role.isActive, true),
							inArray(role.id, options.roleIds)
						)
					);
			} else {
				usersQuery = db
					.select({ userId: userRoleAssignment.userId })
					.from(userRoleAssignment)
					.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
					.where(and(eq(userRoleAssignment.isActive, true), eq(role.isActive, true)));
			}

			const users = await usersQuery;

			// Eliminar duplicados (un usuario puede tener varios roles)
			const uniqueUserIds = [...new Set(users.map((u) => u.userId))];

			if (uniqueUserIds.length === 0) {
				return { success: true, recipientCount: 0, errors: [] };
			}

			// Verificar configuración
			const config = await this.getConfig();
			if (!config.enabled) {
				return { success: false, recipientCount: 0, errors: ['Notificaciones deshabilitadas'] };
			}

			const channels = options.channels || ['in_app'];
			const broadcastId = nanoid();
			const now = new Date();

			// Preparar notificaciones para inserción en batch
			const notificationsToInsert = uniqueUserIds.map((userId) => ({
				id: nanoid(),
				userId,
				type: 'system' as const,
				title: options.title,
				message: options.message,
				priority: options.priority || 'normal',
				courseId: null,
				activityId: null,
				metadata: JSON.stringify({ broadcastId, senderId: options.senderId }),
				read: false,
				readAt: null,
				channels: JSON.stringify(channels),
				createdAt: now,
				expiresAt: null
			}));

			// Insertar en lotes de 100 para no sobrecargar
			const BATCH_SIZE = 100;
			for (let i = 0; i < notificationsToInsert.length; i += BATCH_SIZE) {
				const batch = notificationsToInsert.slice(i, i + BATCH_SIZE);
				try {
					await db.insert(notification).values(batch);
					recipientCount += batch.length;
				} catch (err) {
					errors.push(`Error en lote ${Math.floor(i / BATCH_SIZE) + 1}: ${err}`);
				}
			}

			// NOTA: Email deshabilitado para broadcast masivo durante desarrollo
			// Descomentar cuando esté listo para producción:
			// if (channels.includes('email') && config.channels.email.enabled) {
			// 	this.sendBroadcastEmails(uniqueUserIds, options.title, options.message, options.priority)
			// 		.catch((err) => console.error('Error sending broadcast emails:', err));
			// }

			// Registrar en auditoría
			await auditService.log({
				action: auditAction.NOTIFICATION_BULK_SENT,
				userId: options.senderId || null,
				targetType: 'broadcast',
				details: {
					type: 'system',
					title: options.title.substring(0, 50),
					roleIds: options.roleIds || 'all',
					recipientCount,
					channels,
					errorCount: errors.length
				}
			});

			return {
				success: errors.length === 0,
				recipientCount,
				errors
			};
		} catch (error) {
			console.error('Error sending broadcast:', error);
			return {
				success: false,
				recipientCount,
				errors: [error instanceof Error ? error.message : 'Unknown error']
			};
		}
	}

	// ============================================
	// GESTIÓN DE NOTIFICACIONES
	// ============================================

	/**
	 * Obtiene las notificaciones de un usuario
	 */
	async getUserNotifications(
		userId: string,
		options: NotificationQueryOptions = {}
	): Promise<{ notifications: NotificationRecord[]; total: number }> {
		const { page = 1, limit = 20, unreadOnly = false, type, courseId } = options;
		const offset = (page - 1) * limit;

		// Construir condiciones
		const conditions = [eq(notification.userId, userId)];

		if (unreadOnly) {
			conditions.push(eq(notification.read, false));
		}
		if (type) {
			conditions.push(eq(notification.type, type));
		}
		if (courseId) {
			conditions.push(eq(notification.courseId, courseId));
		}

		const whereClause = and(...conditions);

		// Query con joins para obtener nombres
		const notifications = await db
			.select({
				id: notification.id,
				userId: notification.userId,
				type: notification.type,
				title: notification.title,
				message: notification.message,
				priority: notification.priority,
				courseId: notification.courseId,
				activityId: notification.activityId,
				courseName: course.name,
				activityName: interactiveLearning.name,
				metadata: notification.metadata,
				read: notification.read,
				readAt: notification.readAt,
				channels: notification.channels,
				createdAt: notification.createdAt,
				expiresAt: notification.expiresAt
			})
			.from(notification)
			.leftJoin(course, eq(notification.courseId, course.id))
			.leftJoin(interactiveLearning, eq(notification.activityId, interactiveLearning.id))
			.where(whereClause)
			.orderBy(desc(notification.createdAt))
			.limit(limit)
			.offset(offset);

		// Contar total
		const totalResult = await db
			.select({ count: count() })
			.from(notification)
			.where(whereClause);

		return {
			notifications: notifications.map((n) => ({
				...n,
				type: n.type as NotificationTypeKey,
				priority: n.priority as NotificationRecord['priority'],
				metadata: n.metadata ? JSON.parse(n.metadata) : null,
				channels: n.channels ? JSON.parse(n.channels) : []
			})),
			total: totalResult[0]?.count || 0
		};
	}

	/**
	 * Marca una notificación como leída
	 */
	async markAsRead(notificationId: string, userId: string): Promise<boolean> {
		try {
			await db
				.update(notification)
				.set({ read: true, readAt: new Date() })
				.where(and(eq(notification.id, notificationId), eq(notification.userId, userId)));
			return true;
		} catch (error) {
			console.error('Error marking notification as read:', error);
			return false;
		}
	}

	/**
	 * Marca todas las notificaciones de un usuario como leídas
	 */
	async markAllAsRead(userId: string): Promise<boolean> {
		try {
			await db
				.update(notification)
				.set({ read: true, readAt: new Date() })
				.where(and(eq(notification.userId, userId), eq(notification.read, false)));
			return true;
		} catch (error) {
			console.error('Error marking all notifications as read:', error);
			return false;
		}
	}

	/**
	 * Obtiene el contador de notificaciones no leídas
	 */
	async getUnreadCount(userId: string): Promise<number> {
		try {
			const result = await db
				.select({ count: count() })
				.from(notification)
				.where(and(eq(notification.userId, userId), eq(notification.read, false)));

			return result[0]?.count || 0;
		} catch (error) {
			console.error('Error getting unread count:', error);
			return 0;
		}
	}

	/**
	 * Elimina una notificación
	 */
	async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
		try {
			await db
				.delete(notification)
				.where(and(eq(notification.id, notificationId), eq(notification.userId, userId)));
			return true;
		} catch (error) {
			console.error('Error deleting notification:', error);
			return false;
		}
	}

	// ============================================
	// LIMPIEZA
	// ============================================

	/**
	 * Elimina notificaciones expiradas o antiguas según la configuración
	 */
	async cleanupExpired(): Promise<number> {
		try {
			const config = await this.getConfig();
			const retentionDays = config.channels.inApp.retentionDays;
			const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

			const result = await db.delete(notification).where(lte(notification.createdAt, cutoffDate));

			console.log(`Notification cleanup: deleted ${result.changes} notifications older than ${retentionDays} days`);

			// Registrar limpieza en auditoría
			if (result.changes > 0) {
				await auditService.log({
					action: auditAction.NOTIFICATION_CLEANUP,
					userId: null,
					targetType: 'notification',
					details: {
						deletedCount: result.changes,
						retentionDays,
						cutoffDate: cutoffDate.toISOString()
					}
				});
			}

			return result.changes;
		} catch (error) {
			console.error('Error cleaning up notifications:', error);
			return 0;
		}
	}

	// ============================================
	// MÉTODOS AUXILIARES PRIVADOS
	// ============================================

	/**
	 * Envía emails de broadcast en background (no bloquea)
	 * Procesa en lotes pequeños para no sobrecargar el servidor de email
	 */
	private async sendBroadcastEmails(
		userIds: string[],
		title: string,
		message: string,
		priority?: NotificationPriorityKey
	): Promise<void> {
		const BATCH_SIZE = 10; // Lotes pequeños para emails
		const DELAY_BETWEEN_BATCHES = 500; // 500ms entre lotes

		for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
			const batch = userIds.slice(i, i + BATCH_SIZE);

			// Procesar batch en paralelo
			await Promise.allSettled(
				batch.map((userId) =>
					sendEmailNotification({
						userId,
						type: 'system',
						title,
						message,
						priority: priority || 'normal'
					})
				)
			);

			// Pequeña pausa entre lotes para no saturar
			if (i + BATCH_SIZE < userIds.length) {
				await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
			}
		}
	}
}

// Exportar instancia singleton
export const notificationService = new NotificationService();
