import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ActivityDebuggerService } from '$lib/server/activity-debugger';
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

export const load = (async ({ params, url, locals }) => {
	const user = requireAdmin(locals);

	const detail = await ActivityDebuggerService.getSessionDetail(
		{
			actorUserId: user.id,
			actorHighestRoleLevel: user.highestRoleLevel
		},
		params.ilid,
		params.chatId
	);

	return {
		detail,
		tab: url.searchParams.get('tab') || 'timeline',
		density: url.searchParams.get('density') || 'comfortable'
	};
}) satisfies PageServerLoad;

export const actions = {
	toggleSessionCaptureFocus: async ({ request, params, locals }) => {
		const user = requireAdmin(locals);
		const data = await request.formData();
		const enable = data.get('enable')?.toString() === 'true';

		if (enable) {
			await AIRequestCaptureService.setFocus({
				targetType: 'session',
				targetId: params.chatId,
				enabled: true,
				reason:
					data.get('reason')?.toString().trim() || 'Activado desde la vista de sesion del debugger',
				expiresAt: parseOptionalDate(data.get('expiresAt')),
				createdBy: user.id
			});
		} else {
			await AIRequestCaptureService.disableFocus('session', params.chatId, user.id);
		}

		return { success: true };
	}
} satisfies Actions;
