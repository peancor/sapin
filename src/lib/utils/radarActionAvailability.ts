import type { RadarRunView } from '$lib/types/radar';
import type { RadarActionInput } from '$lib/types/radarActions';

/** Mirrors the inclusive snapshot cutoff and exclusive run end used by the server. */
export function radarActionAvailability(
	action: Pick<RadarActionInput, 'window' | 'minutes'>,
	run: Pick<RadarRunView, 'startsAt' | 'endsAt' | 'state'> | null,
	now: number,
	busy = false
): { available: boolean; message: string } {
	if (!run) {
		return {
			available: false,
			message:
				action.window === 'compare'
					? `Disponible tras ${action.minutes * 2} minutos de seguimiento (dos periodos de ${action.minutes} minutos).`
					: 'Disponible al iniciar el seguimiento.'
		};
	}
	if (busy) return { available: false, message: 'Esta acción ya está en curso.' };
	const start = Date.parse(run.startsAt),
		end = Date.parse(run.endsAt);
	if (![start, end, now].every(Number.isFinite))
		return { available: false, message: 'Esperando la hora del seguimiento.' };
	const cutoff = Math.min(now, end - 1);
	if (cutoff < start) return { available: false, message: 'Disponible al iniciar el seguimiento.' };
	if (action.window === 'compare') {
		const readyAt = start + action.minutes * 2 * 60000 - 1;
		if (cutoff < readyAt) {
			if (run.state !== 'active' || now >= end) {
				return {
					available: false,
					message: `Este seguimiento no alcanza los ${action.minutes * 2} minutos necesarios para comparar dos periodos completos.`
				};
			}
			if (end - 1 < readyAt) {
				return {
					available: false,
					message: `La duración prevista no alcanza los ${action.minutes * 2} minutos necesarios. Amplía el seguimiento o reduce el intervalo de la acción.`
				};
			}
			const seconds = Math.ceil((readyAt - now) / 1000);
			return {
				available: false,
				message: `Disponible en ${Math.floor(seconds / 60)} min ${seconds % 60} s; necesita ${action.minutes * 2} minutos de seguimiento.`
			};
		}
	}
	return {
		available: true,
		message:
			action.window === 'recent' && cutoff - start + 1 < action.minutes * 60000
				? 'Disponible: utilizará el tiempo transcurrido desde el inicio.'
				: run.state !== 'active' || now >= end
					? 'Disponible sobre los datos del seguimiento cerrado.'
					: 'Disponible para ejecutar ahora.'
	};
}
