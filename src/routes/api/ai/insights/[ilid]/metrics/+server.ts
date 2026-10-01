import type { RequestHandler } from '@sveltejs/kit';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import { toInsightsConsolidatedMetrics } from '$lib/server/learning-evidence/insights';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const user = locals.user;
		if (!user) {
			return new Response('Usuario no autenticado', { status: 401 });
		}

		const ilid = params.ilid;
		if (!ilid) {
			return new Response('ID de actividad interactiva faltante', { status: 400 });
		}

		const overview = await LearningEvidenceService.getActivityEvidenceOverview(
			{ actorUserId: user.id, actorHighestRoleLevel: user.highestRoleLevel },
			ilid
		);
		const metrics = toInsightsConsolidatedMetrics(overview);

		return new Response(JSON.stringify(metrics), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Error obteniendo metricas:', error);
		return new Response(
			'Error obteniendo metricas: ' + (error instanceof Error ? error.message : 'Error desconocido'),
			{ status: 500 }
		);
	}
};
