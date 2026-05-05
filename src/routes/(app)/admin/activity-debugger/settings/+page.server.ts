import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { AIRequestCaptureService } from '$lib/server/ai/AIRequestCaptureService';

function requireAdmin(locals: App.Locals) {
	if (!locals.user) {
		throw error(401, 'No autenticado');
	}

	if ((locals.user.highestRoleLevel ?? 0) < 90) {
		throw error(403, 'Sin permisos');
	}

	return locals.user;
}

function parseOptionalDate(raw: FormDataEntryValue | null): Date | null {
	const value = raw?.toString().trim();
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const load = (async ({ locals }) => {
	requireAdmin(locals);

	const [config, focuses] = await Promise.all([
		AIRequestCaptureService.getConfig(),
		AIRequestCaptureService.listFocuses({ onlyEnabled: true, onlyActive: true })
	]);

	return {
		config,
		focuses
	};
}) satisfies PageServerLoad;

export const actions = {
	saveConfig: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const retentionDaysRaw = parseInt(data.get('retentionDays')?.toString() || '30', 10);

		await AIRequestCaptureService.saveConfig({
			enabled: data.get('enabled') === 'on',
			mode: 'focus_only',
			payloadSource: 'app_exact',
			payloadLevel: 'full',
			retentionDays: Number.isFinite(retentionDaysRaw) ? Math.max(1, retentionDaysRaw) : 30
		});

		return { success: true };
	},

	setFocus: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const data = await request.formData();
		const targetType = data.get('targetType')?.toString();
		const targetId = data.get('targetId')?.toString().trim();

		if ((targetType !== 'activity' && targetType !== 'session') || !targetId) {
			throw error(400, 'Foco inválido');
		}

		await AIRequestCaptureService.setFocus({
			targetType,
			targetId,
			enabled: true,
			reason: data.get('reason')?.toString().trim() || 'Activado desde settings del debugger',
			expiresAt: parseOptionalDate(data.get('expiresAt')),
			createdBy: user.id
		});

		return { success: true };
	},

	disableFocus: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const data = await request.formData();
		const targetType = data.get('targetType')?.toString();
		const targetId = data.get('targetId')?.toString().trim();

		if ((targetType !== 'activity' && targetType !== 'session') || !targetId) {
			throw error(400, 'Foco inválido');
		}

		await AIRequestCaptureService.disableFocus(targetType, targetId, user.id);
		return { success: true };
	}
} satisfies Actions;
