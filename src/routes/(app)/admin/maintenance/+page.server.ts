import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ROLE_LEVELS } from '$lib/server/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'No autenticado');
	if (locals.user.highestRoleLevel < ROLE_LEVELS.SUPER_ADMIN)
		error(403, 'Acceso denegado: se requiere rol de Super Administrador');

	return {};
};
