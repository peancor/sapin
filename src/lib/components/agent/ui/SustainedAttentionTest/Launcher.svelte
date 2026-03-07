<script lang="ts">
	import ImmersiveToolLauncherCard from '$lib/components/agent/ImmersiveToolLauncherCard.svelte';
	import type { SustainedAttentionPayload } from '../shared/sustained-attention';

	interface Props {
		title?: string;
		initialUserResponse?: Record<string, unknown>;
		onopen?: () => void;
	}

	let { title, initialUserResponse, onopen }: Props = $props();

	const payload = $derived((initialUserResponse as SustainedAttentionPayload | undefined) ?? null);
	const summaryItems = $derived(
		payload
			? [
					{ label: 'Score', value: `${Math.round(payload.score * 100)}%` },
					{ label: 'Comision', value: `${payload.commissionErrors}` },
					{ label: 'Omisiones', value: `${payload.omissionErrors}` }
				]
			: [
					{ label: 'Test', value: 'Go/No-Go' },
					{ label: 'Modo', value: 'Fullscreen' },
					{ label: 'Input', value: 'Espacio o click' }
				]
	);
</script>

<ImmersiveToolLauncherCard
	title={title ?? 'Test de Atencion Sostenida'}
	description="Abre una prueba inmersiva Go/No-Go para medir atencion sostenida, inhibicion y tiempo de reaccion."
	badge="Atencion sostenida"
	completed={!!payload}
	summaryItems={summaryItems}
	statusText={payload
		? 'Resultado guardado. Puedes reabrir la sesion para revisar las metricas.'
		: 'Pulsa para abrir el test. El ensayo empieza solo cuando pulses Empezar.'}
	actionLabel="Abrir test"
	reopenLabel="Reabrir metricas"
	accentClass="from-amber-400 via-orange-500 to-rose-500"
	onopen={onopen}
/>
