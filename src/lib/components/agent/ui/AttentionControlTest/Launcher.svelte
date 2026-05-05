<script lang="ts">
	import ImmersiveToolLauncherCard from '$lib/components/agent/ImmersiveToolLauncherCard.svelte';
	import {
		parseInitialAttentionControlPayload,
		type AttentionControlPayload
	} from '../shared/attention-control';
	import { formatPercent } from '../shared/cognitive-tests';

	interface Props {
		title?: string;
		testType?: 'go_no_go' | 'stroop' | 'flanker' | 'sdmt';
		initialUserResponse?: Record<string, unknown>;
		onopen?: () => void;
	}

	let { title, testType = 'stroop', initialUserResponse, onopen }: Props = $props();

	const payload = $derived(
		parseInitialAttentionControlPayload(initialUserResponse) as AttentionControlPayload | null
	);
	const resolvedTestType = $derived(payload?.testType ?? testType);
	const summaryItems = $derived(
		payload
			? [
					{ label: 'Score', value: formatPercent(payload.score) },
					{
						label: 'Precision',
						value: formatPercent(payload.summary.accuracy)
					},
					{
						label: 'RT media',
						value:
							typeof payload.summary.meanReactionMs === 'number'
								? `${payload.summary.meanReactionMs} ms`
								: 'N/D'
					}
				]
			: resolvedTestType === 'go_no_go'
				? [
						{ label: 'Test', value: 'Go/No-Go' },
						{ label: 'Input', value: 'Espacio o click' },
						{ label: 'Modo', value: 'Fullscreen' }
					]
				: resolvedTestType === 'flanker'
					? [
							{ label: 'Test', value: 'Flanker' },
							{ label: 'Input', value: 'Flechas o botones' },
							{ label: 'Foco', value: 'Flecha central' }
						]
					: [
							{ label: 'Test', value: 'Stroop' },
							{ label: 'Input', value: 'Teclas o toque' },
							{ label: 'Foco', value: 'Color de tinta' }
						]
	);
</script>

<ImmersiveToolLauncherCard
	title={title ??
		(resolvedTestType === 'go_no_go'
			? 'Go/No-Go Task'
			: resolvedTestType === 'flanker'
				? 'Flanker Task'
				: resolvedTestType === 'sdmt'
					? 'SDMT'
					: 'Stroop Task')}
	description={payload
		? 'Resultado guardado. Puedes reabrir la sesion para revisar metricas y ensayos.'
		: resolvedTestType === 'go_no_go'
			? 'Abre una prueba inmersiva para medir inhibicion de respuesta y tiempo de reaccion.'
			: resolvedTestType === 'flanker'
				? 'Abre una prueba inmersiva de atencion selectiva para identificar la flecha central.'
				: resolvedTestType === 'sdmt'
					? 'La variante SDMT queda preparada para una siguiente ola dentro de la misma familia.'
					: 'Abre una prueba inmersiva Stroop para medir control inhibitorio y atencion selectiva.'}
	badge="Atencion y control"
	completed={!!payload}
	summaryItems={summaryItems}
	statusText={payload
		? 'Disponible para consulta en modo solo lectura.'
		: 'Pulsa para abrir la experiencia. El test empieza cuando pulses Empezar.'}
	actionLabel="Abrir test"
	reopenLabel="Reabrir metricas"
	accentClass="from-fuchsia-500 via-rose-500 to-orange-400"
	onopen={onopen}
/>
