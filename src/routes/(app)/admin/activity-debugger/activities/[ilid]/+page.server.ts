import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ActivityDebuggerService } from '$lib/server/activity-debugger';
import { parseActivityDebuggerSessionFilters } from '$lib/server/activity-debugger/query';
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

	const filters = parseActivityDebuggerSessionFilters(url);
	const detail = await ActivityDebuggerService.getActivityDetail(
		{
			actorUserId: user.id,
			actorHighestRoleLevel: user.highestRoleLevel
		},
		params.ilid,
		filters
	);

	return {
		detail,
		filters,
		tab: url.searchParams.get('tab') || 'sessions'
	};
}) satisfies PageServerLoad;

export const actions = {
	toggleActivityCaptureFocus: async ({ request, params, locals }) => {
		const user = requireAdmin(locals);
		const data = await request.formData();
		const enable = data.get('enable')?.toString() === 'true';

		if (enable) {
			await AIRequestCaptureService.setFocus({
				targetType: 'activity',
				targetId: params.ilid,
				enabled: true,
				reason:
					data.get('reason')?.toString().trim() || 'Activado desde la vista de actividad del debugger',
				expiresAt: parseOptionalDate(data.get('expiresAt')),
				createdBy: user.id
			});
		} else {
			await AIRequestCaptureService.disableFocus('activity', params.ilid, user.id);
		}

		return { success: true };
	}
} satisfies Actions;
