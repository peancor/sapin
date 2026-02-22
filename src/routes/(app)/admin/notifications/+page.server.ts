import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { role, user, auditAction, notification } from '$lib/server/db/schema';
import { eq, desc, like, or } from 'drizzle-orm';
import { notificationService } from '$lib/server/notifications';
import { auditService } from '$lib/server/logging/AuditService';
import { fail } from '@sveltejs/kit';
import { nanoid } from 'nanoid';

export const load = (async ({ url }) => {
	// Obtener todos los roles activos
	const roles = await db
		.select({
			id: role.id,
			name: role.name,
			displayName: role.displayName,
			level: role.level
		})
		.from(role)
		.where(eq(role.isActive, true))
		.orderBy(desc(role.level));

	// Buscar usuarios si hay un query de búsqueda
	const searchQuery = url.searchParams.get('search') || '';
	let users: { id: string; email: string; username: string | null }[] = [];

	if (searchQuery.length >= 2) {
		users = await db
			.select({
				id: user.id,
				email: user.email,
				username: user.username
			})
			.from(user)
			.where(
				or(
					like(user.email, `%${searchQuery}%`),
					like(user.username, `%${searchQuery}%`)
				)
			)
			.limit(20);
	}

	// Obtener configuración de notificaciones
	const notificationConfig = await notificationService.getConfig();

	return {
		roles,
		users,
		searchQuery,
		notificationConfig
	};
}) satisfies PageServerLoad;

export const actions = {
	sendBroadcast: async ({ request, locals }) => {
		const currentUser = locals.user;

		if (!currentUser) {
			return fail(401, { error: 'No autorizado' });
		}

		const data = await request.formData();

		const title = data.get('title')?.toString()?.trim();
		const message = data.get('message')?.toString()?.trim();
		const priority = data.get('priority')?.toString() as 'low' | 'normal' | 'high' | 'urgent';
		const roleIds = data.getAll('roles').map((r) => r.toString()).filter(Boolean);
		const sendToAll = data.get('sendToAll') === 'on';
		const channelInApp = data.get('channel_in_app') === 'on';
		const channelEmail = data.get('channel_email') === 'on';

		// Validaciones
		if (!title || title.length < 3) {
			return fail(400, { error: 'El título debe tener al menos 3 caracteres' });
		}

		if (!message || message.length < 10) {
			return fail(400, { error: 'El mensaje debe tener al menos 10 caracteres' });
		}

		if (!sendToAll && roleIds.length === 0) {
			return fail(400, { error: 'Selecciona al menos un rol o marca "Enviar a todos"' });
		}

		if (!channelInApp && !channelEmail) {
			return fail(400, { error: 'Selecciona al menos un canal de envío' });
		}

		// Construir canales
		const channels: ('in_app' | 'email')[] = [];
		if (channelInApp) channels.push('in_app');
		if (channelEmail) channels.push('email');

		// Enviar notificación
		const result = await notificationService.sendBroadcast({
			title,
			message,
			priority: priority || 'normal',
			roleIds: sendToAll ? undefined : roleIds,
			channels,
			senderId: currentUser.id
		});

		if (result.success) {
			return {
				success: true,
				message: `Notificación enviada a ${result.recipientCount} usuario(s)`
			};
		} else {
			return {
				success: true,
				message: `Enviado a ${result.recipientCount} usuario(s) con ${result.errors.length} error(es)`
			};
		}
	},

	sendToUsers: async ({ request, locals }) => {
		const currentUser = locals.user;

		if (!currentUser) {
			return fail(401, { error: 'No autorizado' });
		}

		const data = await request.formData();

		const title = data.get('title')?.toString()?.trim();
		const message = data.get('message')?.toString()?.trim();
		const priority = data.get('priority')?.toString() as 'low' | 'normal' | 'high' | 'urgent';
		const userIds = data.getAll('userIds').map((u) => u.toString()).filter(Boolean);
		const channelInApp = data.get('channel_in_app') === 'on';
		const channelEmail = data.get('channel_email') === 'on';

		// Validaciones
		if (!title || title.length < 3) {
			return fail(400, { error: 'El título debe tener al menos 3 caracteres' });
		}

		if (!message || message.length < 10) {
			return fail(400, { error: 'El mensaje debe tener al menos 10 caracteres' });
		}

		if (userIds.length === 0) {
			return fail(400, { error: 'Selecciona al menos un usuario' });
		}

		if (!channelInApp && !channelEmail) {
			return fail(400, { error: 'Selecciona al menos un canal de envío' });
		}

		// Construir canales
		const channels: ('in_app' | 'email')[] = [];
		if (channelInApp) channels.push('in_app');
		if (channelEmail) channels.push('email');

		// Verificar configuración
		const config = await notificationService.getConfig();
		if (!config.enabled) {
			return fail(400, { error: 'El sistema de notificaciones está deshabilitado' });
		}

		const now = new Date();
		let successCount = 0;

		try {
			// Inserción directa en batch para mejor rendimiento
			const notificationsToInsert = userIds.map((userId) => ({
				id: nanoid(),
				userId,
				type: 'custom' as const,
				title,
				message,
				priority: priority || 'normal',
				courseId: null,
				activityId: null,
				metadata: JSON.stringify({ senderId: currentUser.id, isPersonalized: true }),
				read: false,
				readAt: null,
				channels: JSON.stringify(channels),
				createdAt: now,
				expiresAt: null
			}));

			await db.insert(notification).values(notificationsToInsert);
			successCount = userIds.length;
		} catch (err) {
			console.error('Error inserting notifications:', err);
			return fail(500, { error: 'Error al enviar notificaciones' });
		}

		// Registrar en auditoría el envío personalizado
		await auditService.log({
			action: auditAction.NOTIFICATION_BULK_SENT,
			userId: currentUser.id,
			targetType: 'users',
			details: {
				type: 'custom',
				title: title.substring(0, 50),
				recipientCount: successCount,
				totalAttempted: userIds.length,
				channels
			}
		});

		return {
			success: true,
			message: `Notificación enviada a ${successCount} usuario(s)`
		};
	}
} satisfies Actions;
