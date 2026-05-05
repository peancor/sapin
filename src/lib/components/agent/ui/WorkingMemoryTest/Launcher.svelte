<script lang="ts">
	import ImmersiveToolLauncherCard from '$lib/components/agent/ImmersiveToolLauncherCard.svelte';
	import {
		parseInitialWorkingMemoryPayload,
		type WorkingMemoryPayload
	} from '../shared/working-memory';
	import { formatPercent } from '../shared/cognitive-tests';

	interface Props {
		title?: string;
		mode?: 'forward' | 'backward' | 'both';
		initialUserResponse?: Record<string, unknown>;
		onopen?: () => void;
	}

	let { title, mode = 'both', initialUserResponse, onopen }: Props = $props();

	const payload = $derived(
		parseInitialWorkingMemoryPayload(initialUserResponse) as WorkingMemoryPayload | null
	);
	const summaryItems = $derived(
		payload
			? [
					{ label: 'Score', value: formatPercent(payload.score) },
					{ label: 'Span directo', value: `${payload.summary.maxForwardSpan}` },
					{ label: 'Span inverso', value: `${payload.summary.maxBackwardSpan}` }
				]
			: [
					{ label: 'Test', value: 'Digit Span' },
					{ label: 'Modo', value: mode === 'both' ? 'Directo + inverso' : mode },
					{ label: 'Input', value: 'Teclado o keypad' }
				]
	);
</script>

<ImmersiveToolLauncherCard
	title={title ?? 'Digit Span'}
	description={payload
		? 'Resultado guardado. Puedes revisar tus spans maximos y el log por ensayo.'
		: 'Abre una prueba inmersiva de memoria de trabajo para repetir secuencias numericas en orden directo o inverso.'}
	badge="Memoria de trabajo"
	completed={!!payload}
	summaryItems={summaryItems}
	statusText={payload
		? 'Disponible para consulta en modo solo lectura.'
		: 'Pulsa para abrir el test. La sesion empieza cuando pulses Empezar.'}
	actionLabel="Abrir test"
	reopenLabel="Reabrir metricas"
	accentClass="from-cyan-400 via-sky-500 to-blue-600"
	onopen={onopen}
/>
