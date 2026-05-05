<script lang="ts">
	import ImmersiveToolLauncherCard from '$lib/components/agent/ImmersiveToolLauncherCard.svelte';
	import {
		getDrivingPsychotechLabel,
		parseInitialDrivingPsychotechPayload,
		type DrivingPsychotechPayload,
		type DrivingPsychotechTestType
	} from '../shared/driving-psychotech';
	import { formatPercent } from '../shared/cognitive-tests';

	interface Props {
		title?: string;
		testType?: DrivingPsychotechTestType;
		initialUserResponse?: Record<string, unknown>;
		onopen?: () => void;
	}

	let { title, testType = 'time_to_contact', initialUserResponse, onopen }: Props = $props();

	const payload = $derived(
		parseInitialDrivingPsychotechPayload(initialUserResponse) as DrivingPsychotechPayload | null
	);
	const resolvedTestType = $derived(payload?.testType ?? testType);
	const summaryItems = $derived(
		payload
			? payload.testType === 'bimanual_coordination'
				? [
						{ label: 'Score', value: formatPercent(payload.score) },
						{
							label: 'Pista L/R',
							value: `${payload.summary.percentOnTrackLeft}% / ${payload.summary.percentOnTrackRight}%`
						},
						{
							label: 'Salidas',
							value: `${payload.summary.offTrackEventsLeft + payload.summary.offTrackEventsRight}`
						}
					]
				: payload.testType === 'time_to_contact'
					? [
							{ label: 'Score', value: formatPercent(payload.score) },
							{
								label: 'Error medio',
								value:
									typeof payload.summary.meanAbsoluteErrorMs === 'number'
										? `${payload.summary.meanAbsoluteErrorMs} ms`
										: 'N/D'
							},
							{ label: 'A tiempo', value: `${payload.summary.onTimeCount}` }
						]
					: [
							{ label: 'Score', value: formatPercent(payload.score) },
							{ label: 'Hits', value: `${payload.summary.hits}` },
							{
								label: 'RT media',
								value:
									typeof payload.summary.meanReactionMs === 'number'
										? `${payload.summary.meanReactionMs} ms`
										: 'N/D'
							}
						]
			: resolvedTestType === 'bimanual_coordination'
				? [
						{ label: 'Input', value: '2 dedos o A/D + J/L' },
						{ label: 'Motor', value: 'Continuo' },
						{ label: 'Vista', value: 'Fullscreen' }
					]
				: resolvedTestType === 'time_to_contact'
					? [
							{ label: 'Input', value: 'Tap o espacio' },
							{ label: 'Foco', value: 'Tiempo oculto' },
							{ label: 'Vista', value: 'Fullscreen' }
						]
					: [
							{ label: 'Input', value: 'Freno o izquierda/derecha' },
							{ label: 'Foco', value: 'Peligro real' },
							{ label: 'Vista', value: 'Fullscreen' }
						]
	);
</script>

<ImmersiveToolLauncherCard
	title={title ?? getDrivingPsychotechLabel(resolvedTestType)}
	description={payload
		? 'Resultado guardado. Puedes reabrir la sesion para revisar metricas y trazas relevantes.'
		: resolvedTestType === 'bimanual_coordination'
			? 'Abre una prueba inmersiva de coordinacion bimanual con dos pistas paralelas y control simultaneo.'
			: resolvedTestType === 'time_to_contact'
				? 'Abre una prueba inmersiva de anticipacion temporal con objeto oculto y respuesta exacta.'
				: 'Abre una prueba inmersiva de reaccion y frenado ante peligros y distractores.'}
	badge="Psicotecnico de conduccion"
	completed={!!payload}
	summaryItems={summaryItems}
	statusText={payload
		? 'Disponible para consulta en modo solo lectura.'
		: 'Pulsa para abrir la experiencia. El test empieza cuando pulses Empezar.'}
	actionLabel="Abrir test"
	reopenLabel="Reabrir metricas"
	accentClass="from-sky-500 via-cyan-500 to-emerald-500"
	onopen={onopen}
/>
