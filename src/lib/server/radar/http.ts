import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { authorizeRadar } from './access';
import { radarRepository as repo } from './service';
import { RadarError } from './RadarRepository';
import { createRunSchema, patchRunSchema, presetSchema } from './domain';

type Operation =
	| 'list'
	| 'create'
	| 'snapshot'
	| 'patch'
	| 'stop'
	| 'analyze'
	| 'evidence'
	| 'presets'
	| 'savePreset'
	| 'deletePreset';
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
			if (operation === 'presets')
				return json({ presets: repo.presets(cid) }, { headers: { 'cache-control': 'no-store' } });
			if (operation === 'savePreset')
				return json(repo.createPreset(cid, presetSchema.parse(await event.request.json())), {
					status: 201
				});
			if (operation === 'deletePreset') {
				if (!event.params.presetId) throw new RadarError(404, 'Configuración no encontrada.');
				repo.deletePreset(cid, event.params.presetId);
				return new Response(null, { status: 204 });
			}
			const window = event.url.searchParams.get('window') ?? 'recent';
			if (window !== 'recent' && window !== 'all') throw new RadarError(400, 'Ventana no válida.');
			if (operation === 'list')
				return json(repo.history(cid, ilid, pagination(event)), {
					headers: { 'cache-control': 'no-store' }
				});
			if (operation === 'create')
				return json(
					repo.view(
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
				return json(
					repo.view(
						repo.patch(
							runId,
							patchRunSchema.parse(await event.request.json()),
							event.locals.user!.id
						)
					)
				);
			if (operation === 'stop') return json(repo.view(repo.stop(runId)), { status: 202 });
			if (operation === 'analyze') return json(repo.view(repo.queue(runId)), { status: 202 });
			if (!topicId) throw new RadarError(404, 'Agrupación no encontrada.');
			return json(repo.evidence(runId, topicId, window, pagination(event)), {
				headers: { 'cache-control': 'no-store' }
			});
		} catch (error) {
			if (error instanceof RadarError)
				return json({ message: error.message }, { status: error.status });
			if (error instanceof ZodError || error instanceof SyntaxError)
				return json(
					{
						message:
							'Revisa los campos enviados y sus límites: contexto (6000), instrucciones (4000), configuración y fechas válidas.'
					},
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
