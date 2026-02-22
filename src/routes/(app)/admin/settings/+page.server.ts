import type { PageServerLoad, Actions } from './$types';
import { emailService } from '$lib/server/email';
import type { EmailConfig } from '$lib/types/email';
import { getAnalyticsConfig, saveAnalyticsConfig } from '$lib/server/analytics/AnalyticsService';
import { notificationService, type NotificationConfig } from '$lib/server/notifications';
import { db } from '$lib/server/db';
import { user, role, userRoleAssignment } from '$lib/server/db/schema';
import { eq, and, gte } from 'drizzle-orm';

export const load = (async () => {
	const emailConfig = await emailService.getConfig();
	const analyticsConfig = await getAnalyticsConfig();
	const notificationConfig = await notificationService.getConfig();

	// Get admins and teachers for contact form recipients selection
	const adminUsers = await db
		.select({
			id: user.id,
			username: user.username,
			email: user.email,
			roleLevel: role.level,
			roleName: role.displayName
		})
		.from(user)
		.innerJoin(userRoleAssignment, eq(userRoleAssignment.userId, user.id))
		.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
		.where(
			and(
				eq(userRoleAssignment.isActive, true),
				eq(role.isActive, true),
				gte(role.level, 50) // Teachers and admins
			)
		);

	// Deduplicate users (they might have multiple roles)
	const uniqueUsers = [...new Map(adminUsers.map((u) => [u.id, u])).values()];

	const settings = {
		email: emailConfig,
		analytics: analyticsConfig,
		notifications: notificationConfig
	};

	return { settings, adminUsers: uniqueUsers };
}) satisfies PageServerLoad;

export const actions = {
	saveEmailSettings: async ({ request }) => {
		const data = await request.formData();

		const emailConfig: EmailConfig = {
			provider: (data.get('provider')?.toString() as 'smtp' | 'resend') || 'smtp',
			enabled: data.get('enabled') === 'on',
			smtp: {
				host: data.get('smtpHost')?.toString() || '',
				port: parseInt(data.get('smtpPort')?.toString() || '587'),
				secure: data.get('smtpSecure') === 'on',
				auth: {
					user: data.get('smtpUser')?.toString() || '',
					pass: data.get('smtpPass')?.toString() || ''
				},
				fromName: data.get('fromName')?.toString() || '',
				fromEmail: data.get('fromEmail')?.toString() || ''
			}
		};

		const saved = await emailService.saveConfig(emailConfig);

		return { success: saved };
	},

	testEmailConnection: async () => {
		const result = await emailService.testConnection();
		return {
			success: result.success,
			message: result.success ? 'Conexión exitosa' : result.error
		};
	},

	sendTestEmail: async ({ request }) => {
		const data = await request.formData();
		const testEmail = data.get('testEmail')?.toString();

		if (!testEmail) {
			return { success: false, message: 'Por favor ingresa un email de prueba' };
		}

		const result = await emailService.sendTestEmail(testEmail);
		return {
			success: result.success,
			message: result.success ? 'Email de prueba enviado correctamente' : result.error
		};
	},

	saveAnalyticsSettings: async ({ request }) => {
		const data = await request.formData();

		await saveAnalyticsConfig({
			enabled: data.get('analyticsEnabled') === 'on',
			trackPageViews: data.get('analyticsTrackPageViews') === 'on',
			trackSessions: data.get('analyticsTrackSessions') === 'on',
			retentionDays: parseInt(data.get('analyticsRetentionDays')?.toString() || '90', 10)
		});

		return { success: true };
	},

	saveNotificationSettings: async ({ request, locals }) => {
		const data = await request.formData();
		const userId = locals.user?.id;

		// Parse contact form recipients (comma-separated user IDs)
		const recipientsRaw = data.get('contactFormRecipients')?.toString() || '';
		const contactFormRecipients = recipientsRaw
			.split(',')
			.map((id) => id.trim())
			.filter((id) => id.length > 0);

		const config: NotificationConfig = {
			enabled: data.get('notificationsEnabled') === 'on',
			channels: {
				inApp: {
					enabled: data.get('inAppEnabled') === 'on',
					retentionDays: parseInt(data.get('inAppRetentionDays')?.toString() || '30')
				},
				email: {
					enabled: data.get('emailEnabled') === 'on'
				}
			},
			types: {
				activity_completed: {
					enabled: data.get('type_activity_completed') === 'on',
					channels: getChannelsFromForm(data, 'activity_completed')
				},
				enrollment: {
					enabled: data.get('type_enrollment') === 'on',
					channels: getChannelsFromForm(data, 'enrollment')
				},
				new_activity: {
					enabled: data.get('type_new_activity') === 'on',
					channels: getChannelsFromForm(data, 'new_activity')
				},
				course_update: {
					enabled: data.get('type_course_update') === 'on',
					channels: getChannelsFromForm(data, 'course_update')
				},
				contact_form: {
					enabled: data.get('type_contact_form') === 'on',
					channels: getChannelsFromForm(data, 'contact_form')
				},
				system: {
					enabled: data.get('type_system') === 'on',
					channels: getChannelsFromForm(data, 'system')
				},
				custom: {
					enabled: data.get('type_custom') === 'on',
					channels: getChannelsFromForm(data, 'custom')
				}
			},
			contactFormRecipients
		};

		await notificationService.saveConfig(config, userId);
		return { success: true };
	}
} satisfies Actions;

function getChannelsFromForm(data: FormData, typeKey: string): ('in_app' | 'email')[] {
	const channels: ('in_app' | 'email')[] = [];
	if (data.get(`${typeKey}_channel_in_app`) === 'on') {
		channels.push('in_app');
	}
	if (data.get(`${typeKey}_channel_email`) === 'on') {
		channels.push('email');
	}
	return channels.length > 0 ? channels : ['in_app'];
}
