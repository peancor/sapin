import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { authorizeRadar } from './access';
import { radarRepository as repo } from './service';
import { RadarError, runView } from './RadarRepository';
import { createRunSchema, patchRunSchema } from './domain';

type Operation = 'list' | 'create' | 'snapshot' | 'patch' | 'stop' | 'analyze' | 'evidence';
function pagination(event: RequestEvent) {
	const offset = Number(event.url.searchParams.get('offset') ?? 0);
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
		throw new RadarError(400, 'Paginación no válida.');
	return offset;
}
export function radarHandler(operation: Operation): RequestHandler {
	return async (event) => {
		try {
			const { cid, ilid, runId, topicId } = event.params;
			if (!cid || !ilid) throw new RadarError(404, 'Actividad no encontrada.');
			await authorizeRadar(repo, event.locals.user?.id, cid, ilid);
			const window = event.url.searchParams.get('window') ?? 'recent';
			if (window !== 'recent' && window !== 'all') throw new RadarError(400, 'Ventana no válida.');
			if (operation === 'list')
				return json(repo.history(cid, ilid, pagination(event)), {
					headers: { 'cache-control': 'no-store' }
				});
			if (operation === 'create')
				return json(
					runView(
						repo.create(
							cid,
							ilid,
							event.locals.user!.id,
							createRunSchema.parse(await event.request.json())
						)
					),
					{ status: 201 }
				);
			if (!runId) throw new RadarError(404, 'Seguimiento no encontrado.');
			repo.get(runId, cid, ilid);
			if (operation === 'snapshot')
				return json(repo.snapshot(runId, window), { headers: { 'cache-control': 'no-store' } });
			if (operation === 'patch')
				return json(runView(repo.patch(runId, patchRunSchema.parse(await event.request.json()))));
			if (operation === 'stop') return json(runView(repo.stop(runId)), { status: 202 });
			if (operation === 'analyze') return json(runView(repo.queue(runId)), { status: 202 });
			if (!topicId) throw new RadarError(404, 'Agrupación no encontrada.');
			return json(repo.evidence(runId, topicId, window, pagination(event)), {
				headers: { 'cache-control': 'no-store' }
			});
		} catch (error) {
			if (error instanceof RadarError)
				return json({ message: error.message }, { status: error.status });
			if (error instanceof ZodError || error instanceof SyntaxError)
				return json(
					{ message: 'Revisa los campos enviados: título, duración, modelo y fechas válidas.' },
					{ status: 400 }
				);
			console.error(
				'[Radar] Error en la operación',
				operation,
				error instanceof Error ? error.name : 'Unknown'
			);
			return json({ message: 'No se pudo completar la operación del radar.' }, { status: 500 });
		}
	};
}
