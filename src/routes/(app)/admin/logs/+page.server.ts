import { redirect, type ServerLoadEvent, type Actions } from '@sveltejs/kit';
import { auditService, auditAction } from '$lib/server/logging';

export const load = async ({ locals, url }: ServerLoadEvent) => {
	// Verificar autenticacion
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Verificar nivel de rol admin
	const highestRoleLevel = locals.user.highestRoleLevel || 0;
	if (highestRoleLevel < 90) {
		throw redirect(302, '/');
	}

	// Parametros de consulta
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '50', 10);
	const action = url.searchParams.get('action') || undefined;
	const severity = url.searchParams.get('severity') || undefined;
	const search = url.searchParams.get('search') || undefined;
	const startDateStr = url.searchParams.get('startDate');
	const endDateStr = url.searchParams.get('endDate');

	const startDate = startDateStr ? new Date(startDateStr) : undefined;
	const endDate = endDateStr ? new Date(endDateStr) : undefined;

	// Obtener datos
	const [logsResult, config, stats, availableActions] = await Promise.all([
		auditService.query({
			page,
			limit,
			action,
			severity,
			search,
			startDate,
			endDate
		}),
		auditService.getConfig(),
		auditService.getStats(),
		auditService.getAvailableActions()
	]);

	return {
		logs: logsResult.logs,
		total: logsResult.total,
		page,
		limit,
		config,
		stats,
		availableActions,
		auditActionTypes: Object.values(auditAction),
		filters: {
			action,
			severity,
			search,
			startDate: startDateStr,
			endDate: endDateStr
		}
	};
};

export const actions: Actions = {
	cleanup: async ({ locals }) => {
		// Verificar permisos
		if (!locals.user || (locals.user.highestRoleLevel || 0) < 90) {
			return { success: false, error: 'Sin permisos' };
		}

		const result = await auditService.cleanup();
		return { success: true, deleted: result.deleted };
	}
};
