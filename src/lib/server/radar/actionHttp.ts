import { json, type RequestHandler } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { authorizeRadar } from './access';
import { RadarError } from './RadarRepository';
import {
	radarRepository as radar,
	radarActionRepository as repo,
	radarActionWorker as worker
} from './service';
import { actionSchema, actionPatchSchema, executeActionSchema } from './actionDomain';

type Operation =
	'list' | 'create' | 'patch' | 'delete' | 'history' | 'execute' | 'execution' | 'evidence';
export function radarActionHandler(operation: Operation): RequestHandler {
	return async (event) => {
		const respond = (data: unknown, status = 200) =>
			json(data, { status, headers: { 'cache-control': 'no-store' } });
		try {
			const { cid, ilid, actionId, runId, executionId } = event.params;
			if (!cid || !ilid) throw new RadarError(404, 'Actividad no encontrada.');
			await authorizeRadar(radar, event.locals.user?.id, cid, ilid);
			if (operation === 'list') return respond({ actions: repo.list(cid, ilid) });
			if (operation === 'create')
				return respond(repo.save(cid, ilid, actionSchema.parse(await event.request.json())), 201);
			if (operation === 'patch') {
				if (!actionId) throw new RadarError(404, 'Acción no encontrada.');
				const { revision, ...definition } = actionPatchSchema.parse(await event.request.json());
				return respond(repo.save(cid, ilid, definition, actionId, revision));
			}
			if (operation === 'delete') {
				if (!actionId) throw new RadarError(404, 'Acción no encontrada.');
				const revision = Number(event.url.searchParams.get('revision'));
				if (!Number.isSafeInteger(revision) || revision < 1)
					throw new RadarError(400, 'Revisión no válida.');
				repo.delete(actionId, cid, ilid, revision);
				return new Response(null, { status: 204 });
			}
			if (!runId) throw new RadarError(404, 'Seguimiento no encontrado.');
			radar.get(runId, cid, ilid);
			if (operation === 'history') {
				const offset = Number(event.url.searchParams.get('offset') ?? 0);
				if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
					throw new RadarError(400, 'Paginación no válida.');
				return respond(repo.history(runId, offset));
			}
			if (operation === 'execute') {
				const input = executeActionSchema.parse(await event.request.json());
				const execution = repo.enqueue(
					runId,
					event.locals.user!.id,
					input.actionId,
					input.revision,
					input.requestId
				);
				if (process.env.NODE_ENV !== 'test')
					void worker.tick().catch(() => console.error('[Radar] No se pudo iniciar la acción.'));
				return respond(execution, 202);
			}
			if (!executionId) throw new RadarError(404, 'Ejecución no encontrada.');
			const row = repo.ensureValid(repo.raw(executionId, runId));
			if (operation === 'execution') return respond(repo.view(row));
			const ids = (event.url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
			if (!ids.length || ids.length > 20 || ids.some((id) => id.length > 100))
				throw new RadarError(400, 'Selecciona entre 1 y 20 evidencias.');
			return respond({ evidence: repo.evidence(row, ids) });
		} catch (error) {
			if (error instanceof RadarError) return respond({ error: error.message }, error.status);
			if (error instanceof ZodError || error instanceof SyntaxError)
				return respond({ error: 'La configuración de la acción no es válida.' }, 400);
			console.error('[Radar] Error en una operación de acciones.');
			return respond({ error: 'No se ha podido completar la operación.' }, 500);
		}
	};
}
