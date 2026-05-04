import type { PageServerLoad, Actions } from './$types';
import { AIModelService } from '$lib/server/ai/AIModelService';
import { error, fail } from '@sveltejs/kit';
import { ROLE_LEVELS } from '$lib/server/roles';
import * as table from '$lib/server/db/schema';

function requireAdmin(locals: App.Locals) {
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	if (locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) {
		throw error(403, 'No autorizado');
	}
}

export const load = (async () => {
	// Seed defaults si es necesario
	await AIModelService.seedDefaultProviders();
	await AIModelService.seedDefaultModels();

	const providers = await AIModelService.getAllProviders();
	const models = await AIModelService.getAllModels();
	const quotas = await AIModelService.getAllQuotas();

	// Estadísticas generales
	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const usageStats = await AIModelService.getUsageStats(startOfMonth);

	// Estadísticas diarias del último mes
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const dailyStats = await AIModelService.getDailyStats(
		thirtyDaysAgo.toISOString().split('T')[0],
		now.toISOString().split('T')[0]
	);

	// Logs recientes
	const recentLogs = await AIModelService.getRecentUsageLogs(20);

	// Top usuarios
	const topUsers = await AIModelService.getTopUsersByUsage(startOfMonth, now, 5);

	return {
		providers,
		models,
		quotas,
		usageStats,
		dailyStats,
		recentLogs,
		topUsers,
		providerTypes: Object.entries(table.aiProviderType).map(([key, value]) => ({
			value: key,
			name: value
		})),
		quotaTypes: Object.entries(table.aiQuotaType).map(([key, value]) => ({
			value: key,
			name: value
		})),
		quotaPeriods: Object.entries(table.aiQuotaPeriod).map(([key, value]) => ({
			value: key,
			name: value
		}))
	};
}) satisfies PageServerLoad;

export const actions = {
	createProvider: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();

		const name = data.get('name')?.toString();
		const displayName = data.get('displayName')?.toString();
		const type = data.get('type')?.toString() as keyof typeof table.aiProviderType;
		const baseUrl = data.get('baseUrl')?.toString() || undefined;
		const apiKey = data.get('apiKey')?.toString() || undefined;

		if (!name || !displayName || !type) {
			return fail(400, { error: 'Nombre, nombre a mostrar y tipo son requeridos' });
		}

		try {
			await AIModelService.createProvider({
				name,
				displayName,
				type,
				baseUrl,
				apiKey
			});
			return { success: true, message: 'Proveedor creado correctamente' };
		} catch {
			return fail(500, { error: 'Error al crear el proveedor' });
		}
	},

	updateProvider: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ID requerido' });

		try {
			await AIModelService.updateProvider(id, {
				name: data.get('name')?.toString(),
				displayName: data.get('displayName')?.toString(),
				type: data.get('type')?.toString() as keyof typeof table.aiProviderType,
				baseUrl: data.get('baseUrl')?.toString() || undefined,
				apiKey: data.get('apiKey')?.toString() || undefined,
				isActive: data.get('isActive') === 'on'
			});
			return { success: true, message: 'Proveedor actualizado' };
		} catch {
			return fail(500, { error: 'Error al actualizar el proveedor' });
		}
	},

	deleteProvider: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ID requerido' });

		try {
			await AIModelService.deleteProvider(id);
			return { success: true, message: 'Proveedor eliminado' };
		} catch {
			return fail(500, { error: 'Error al eliminar el proveedor. Asegúrate de que no tiene modelos asociados.' });
		}
	},

	createModel: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();

		const providerId = data.get('providerId')?.toString();
		const name = data.get('name')?.toString();
		const displayName = data.get('displayName')?.toString();

		if (!providerId || !name || !displayName) {
			return fail(400, { error: 'Proveedor, nombre y nombre a mostrar son requeridos' });
		}

		const capabilitiesStr = data.get('capabilities')?.toString();
		const capabilities = capabilitiesStr ? capabilitiesStr.split(',').map((c) => c.trim()) : [];

		try {
			await AIModelService.createModel({
				providerId,
				name,
				displayName,
				description: data.get('description')?.toString(),
				capabilities,
				contextWindow: parseInt(data.get('contextWindow')?.toString() || '0') || undefined,
				maxOutputTokens: parseInt(data.get('maxOutputTokens')?.toString() || '0') || undefined,
				inputPricePerMillion: parseFloat(data.get('inputPricePerMillion')?.toString() || '0') || undefined,
				outputPricePerMillion: parseFloat(data.get('outputPricePerMillion')?.toString() || '0') || undefined,
				isDefault: data.get('isDefault') === 'on',
				isActive: data.get('isActive') !== 'off',
				sortOrder: parseInt(data.get('sortOrder')?.toString() || '0')
			});
			return { success: true, message: 'Modelo creado correctamente' };
		} catch {
			return fail(500, { error: 'Error al crear el modelo' });
		}
	},

	updateModel: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ID requerido' });

		const capabilitiesStr = data.get('capabilities')?.toString();
		const capabilities = capabilitiesStr ? capabilitiesStr.split(',').map((c) => c.trim()) : undefined;

		try {
			await AIModelService.updateModel(id, {
				providerId: data.get('providerId')?.toString(),
				name: data.get('name')?.toString(),
				displayName: data.get('displayName')?.toString(),
				description: data.get('description')?.toString(),
				capabilities,
				contextWindow: parseInt(data.get('contextWindow')?.toString() || '0') || undefined,
				maxOutputTokens: parseInt(data.get('maxOutputTokens')?.toString() || '0') || undefined,
				inputPricePerMillion: parseFloat(data.get('inputPricePerMillion')?.toString() || '0') || undefined,
				outputPricePerMillion: parseFloat(data.get('outputPricePerMillion')?.toString() || '0') || undefined,
				isDefault: data.get('isDefault') === 'on',
				isActive: data.get('isActive') === 'on',
				sortOrder: parseInt(data.get('sortOrder')?.toString() || '0')
			});
			return { success: true, message: 'Modelo actualizado' };
		} catch {
			return fail(500, { error: 'Error al actualizar el modelo' });
		}
	},

	deleteModel: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ID requerido' });

		try {
			await AIModelService.deleteModel(id);
			return { success: true, message: 'Modelo eliminado' };
		} catch {
			return fail(500, { error: 'Error al eliminar el modelo' });
		}
	},

	toggleModelActive: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const isActive = data.get('isActive') === 'true';

		if (!id) return fail(400, { error: 'ID requerido' });

		try {
			await AIModelService.updateModel(id, { isActive: !isActive });
			return { success: true };
		} catch {
			return fail(500, { error: 'Error al cambiar estado del modelo' });
		}
	},

	setDefaultModel: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ID requerido' });

		try {
			await AIModelService.updateModel(id, { isDefault: true });
			return { success: true, message: 'Modelo establecido como predeterminado' };
		} catch {
			return fail(500, { error: 'Error al establecer modelo predeterminado' });
		}
	},

	createQuota: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();

		const type = data.get('type')?.toString() as keyof typeof table.aiQuotaType;

		if (!type) {
			return fail(400, { error: 'Tipo de cuota requerido' });
		}

		try {
			await AIModelService.createQuota({
				type,
				targetId: data.get('targetId')?.toString() || undefined,
				modelId: data.get('modelId')?.toString() || undefined,
				period: data.get('period')?.toString() as keyof typeof table.aiQuotaPeriod,
				maxTokens: parseInt(data.get('maxTokens')?.toString() || '0') || undefined,
				maxRequests: parseInt(data.get('maxRequests')?.toString() || '0') || undefined,
				maxCost: parseFloat(data.get('maxCost')?.toString() || '0') || undefined
			});
			return { success: true, message: 'Cuota creada correctamente' };
		} catch {
			return fail(500, { error: 'Error al crear la cuota' });
		}
	},

	updateQuota: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ID requerido' });

		try {
			await AIModelService.updateQuota(id, {
				type: data.get('type')?.toString() as keyof typeof table.aiQuotaType,
				targetId: data.get('targetId')?.toString() || undefined,
				modelId: data.get('modelId')?.toString() || undefined,
				period: data.get('period')?.toString() as keyof typeof table.aiQuotaPeriod,
				maxTokens: parseInt(data.get('maxTokens')?.toString() || '0') || undefined,
				maxRequests: parseInt(data.get('maxRequests')?.toString() || '0') || undefined,
				maxCost: parseFloat(data.get('maxCost')?.toString() || '0') || undefined
			});
			return { success: true, message: 'Cuota actualizada' };
		} catch {
			return fail(500, { error: 'Error al actualizar la cuota' });
		}
	},

	deleteQuota: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ID requerido' });

		try {
			await AIModelService.deleteQuota(id);
			return { success: true, message: 'Cuota eliminada' };
		} catch {
			return fail(500, { error: 'Error al eliminar la cuota' });
		}
	},

	resetQuota: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const id = data.get('id')?.toString();

		if (!id) return fail(400, { error: 'ID requerido' });

		try {
			await AIModelService.resetQuota(id);
			return { success: true, message: 'Cuota reseteada' };
		} catch {
			return fail(500, { error: 'Error al resetear la cuota' });
		}
	}
} satisfies Actions;
