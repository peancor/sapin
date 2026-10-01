<script lang="ts">
	import ImmersiveToolLauncherCard from '$lib/components/agent/ImmersiveToolLauncherCard.svelte';
	import type { Difficulty, TimedQuizPayload, TimedQuizQuestion, TimerByDifficultySec } from '../shared/timed-quiz';

	interface Props {
		title?: string;
		questions: TimedQuizQuestion[];
		difficulty?: Difficulty;
		timerByDifficultySec?: TimerByDifficultySec;
		initialUserResponse?: Record<string, unknown>;
		onopen?: () => void;
	}

	let { title, questions, initialUserResponse, onopen }: Props = $props();

	const payload = $derived((initialUserResponse as TimedQuizPayload | undefined) ?? null);
	const summaryItems = $derived(
		payload
			? [
					{ label: 'Score', value: `${Math.round(payload.score * 100)}%` },
					{ label: 'Correctas', value: `${payload.correctCount}/${questions.length}` },
					{ label: 'Timeouts', value: `${payload.timeoutCount}` }
				]
			: [
					{ label: 'Preguntas', value: `${questions.length}` },
					{ label: 'Modo', value: 'Arcade' },
					{ label: 'Formato', value: 'Fullscreen' }
				]
	);
</script>

<ImmersiveToolLauncherCard
	title={title ?? 'Quiz Contrarreloj Arcade'}
	description="Abre un quiz secuencial a pantalla completa con temporizador, HUD y respuestas grandes."
	badge="Quiz inmersivo"
	completed={!!payload}
	summaryItems={summaryItems}
	statusText={payload
		? 'Resultado guardado. Puedes reabrir para revisar la partida.'
		: 'Pulsa para entrar en el modo arcade y empezar cuando estes listo.'}
	actionLabel="Abrir quiz"
	reopenLabel="Reabrir resultado"
	accentClass="from-cyan-500 via-sky-500 to-indigo-600"
	onopen={onopen}
/>
