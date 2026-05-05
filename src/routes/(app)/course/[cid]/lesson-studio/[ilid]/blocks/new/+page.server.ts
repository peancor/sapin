import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { lessonFlowHref } from '$lib/lesson/lessonStudioNavigation';

export const load = (async ({ params }) => {
	redirect(303, lessonFlowHref({ cid: params.cid, ilid: params.ilid }));
}) satisfies PageServerLoad;

export const actions = {
	createBlock: async () => {
		return fail(410, {
			error: 'Los bloques se crean desde el mapa para mantener posición y conexiones.'
		});
	}
} satisfies Actions;
