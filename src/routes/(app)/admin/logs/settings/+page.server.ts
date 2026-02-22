import { redirect, fail, type ServerLoadEvent, type Actions } from '@sveltejs/kit';
import { auditService } from '$lib/server/logging';

export const load = async ({ locals }: ServerLoadEvent) => {
	// Verificar autenticacion
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Verificar nivel de rol admin
	const highestRoleLevel = locals.user.highestRoleLevel || 0;
	if (highestRoleLevel < 90) {
		throw redirect(302, '/');
	}

	const config = await auditService.getConfig();

	return {
		config
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		// Verificar permisos
		if (!locals.user || (locals.user.highestRoleLevel || 0) < 90) {
			return fail(403, { error: 'Sin permisos' });
		}

		const formData = await request.formData();

		const enabled = formData.get('enabled') === 'on';
		const retentionDays = parseInt(formData.get('retentionDays') as string, 10) || 90;
		const categoryUser = formData.get('categoryUser') === 'on';
		const categoryCourse = formData.get('categoryCourse') === 'on';
		const categorySettings = formData.get('categorySettings') === 'on';
		const categoryNotifications = formData.get('categoryNotifications') === 'on';
		const categoryErrors = formData.get('categoryErrors') === 'on';

		await auditService.saveConfig({
			enabled,
			retentionDays,
			categories: {
				user: categoryUser,
				course: categoryCourse,
				settings: categorySettings,
				notifications: categoryNotifications,
				errors: categoryErrors
			}
		});

		return { success: true };
	}
};
