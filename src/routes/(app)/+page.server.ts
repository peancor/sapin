import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load = (async ({ locals }) => {
	// Redirigir usuarios autenticados al dashboard
	if (locals.user) {
		throw redirect(303, '/dashboard');
	}

	return {
		user: locals.user
	};
}) satisfies PageServerLoad;
