import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authorizeRadar } from '$lib/server/radar/access';
import { RadarError } from '$lib/server/radar/RadarRepository';
import { radarRepository } from '$lib/server/radar/service';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		await authorizeRadar(radarRepository, locals.user?.id, params.cid, params.ilid);
		return {
			radarModels: radarRepository
				.models()
				.map((m) => ({ id: m.id, name: m.displayName, isDefault: m.isDefault })),
			radarHistory: radarRepository.history(params.cid, params.ilid)
		};
	} catch (cause) {
		if (cause instanceof RadarError) error(cause.status, cause.message);
		throw cause;
	}
};
