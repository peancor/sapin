<script lang="ts">
	import { onDestroy } from 'svelte';
	import { submitUIResponse } from '../shared/ui-response';
	import {
		buildSustainedAttentionPayload,
		buildTrialResult,
		resolveSustainedAttentionConfig,
		type SustainedAttentionPayload,
		type SustainedAttentionTrial,
		type SustainedAttentionTrialResult
	} from '../shared/sustained-attention';

	interface ImmersiveState {
		canCloseSafely: boolean;
		closePrompt?: string;
	}

	interface Props {
		instanceId: string;
		title?: string;
		testType?: 'go_no_go';
		difficulty?: 'easy' | 'medium' | 'hard';
		instructions?: string;
		practiceTrials?: number;
		mainTrials?: number;
		goStimulus?: string;
		noGoStimulus?: string;
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score: number) => void;
		onPersistedResponse?: (payload: Record<string, unknown>) => void;
		onImmersiveStateChange?: (state: ImmersiveState) => void;
	}

	let {
		instanceId,
		title,
		testType,
		difficulty,
		instructions,
		practiceTrials,
		mainTrials,
		goStimulus,
		noGoStimulus,
		interactive: initialInteractive,
		initialUserResponse,
		apiBase,
		onRespond,
		onPersistedResponse,
		onImmersiveStateChange
	}: Props = $props();

	function createResolvedConfig() {
		return resolveSustainedAttentionConfig({
			title,
			testType,
			difficulty,
			instructions,
			practiceTrials,
			mainTrials,
			goStimulus,
			noGoStimulus
		});
	}

	const config = createResolvedConfig();
	const initialPayload = (() =>
		(initialUserResponse as SustainedAttentionPayload | undefined) ?? null)();

	let phase = $state<'intro' | 'practice' | 'practice-complete' | 'main' | 'results'>(
		initialPayload ? 'results' : 'intro'
	);
	let interactive = $state((() => initialInteractive && !initialPayload)());
	let hasStarted = $state(false);
	let currentTrial = $state<SustainedAttentionTrial | null>(null);
	let currentIndex = $state(0);
	let trialStartedAtMs = $state<number | null>(null);
	let respondedThisTrial = $state(false);
	let isBetweenTrials = $state(false);
	let pendingResults = $state<SustainedAttentionTrialResult[]>([]);
	let submitError = $state('');
	let isSubmitting = $state(false);
	let submitted = $state(!!initialPayload);
	let pendingPayload = $state<SustainedAttentionPayload | null>(initialPayload);
	let trialTimeout: ReturnType<typeof setTimeout> | null = null;
	let interStimulusTimeout: ReturnType<typeof setTimeout> | null = null;

	const activeTrials = $derived(
		phase === 'practice' ? config.practiceTrials : phase === 'main' ? config.mainTrials : []
	);
	const effectivePayload = $derived(
		initialPayload ??
			buildSustainedAttentionPayload({
				testType: config.testType,
				difficulty: config.difficulty,
				results: pendingResults
			})
	);
	const scorePercent = $derived(Math.round(effectivePayload.score * 100));
	const practiceCompleted = $derived(
		pendingResults.filter((result) => result.phase === 'practice').length === config.practiceTrials.length
	);

	function setImmersiveState() {
		onImmersiveStateChange?.({
			canCloseSafely: phase === 'intro' || phase === 'results',
			closePrompt: 'Si sales ahora se perdera el test en curso. ¿Quieres cerrar?'
		});
	}

	function clearTimers() {
		if (trialTimeout !== null) {
			clearTimeout(trialTimeout);
			trialTimeout = null;
		}

		if (interStimulusTimeout !== null) {
			clearTimeout(interStimulusTimeout);
			interStimulusTimeout = null;
		}
	}

	function loadTrial(index: number) {
		const trials = phase === 'practice' ? config.practiceTrials : config.mainTrials;
		const nextTrial = trials[index] ?? null;

		if (!nextTrial) {
			if (phase === 'practice') {
				phase = 'practice-complete';
				currentTrial = null;
				setImmersiveState();
				return;
			}

			phase = 'results';
			currentTrial = null;
			const payload = buildSustainedAttentionPayload({
				testType: config.testType,
				difficulty: config.difficulty,
				results: pendingResults
			});
			pendingPayload = payload;
			void persistPayload(payload);
			setImmersiveState();
			return;
		}

		currentIndex = index;
		currentTrial = nextTrial;
		trialStartedAtMs = Date.now();
		respondedThisTrial = false;
		isBetweenTrials = false;

		trialTimeout = setTimeout(() => {
			finalizeTrial(false, null);
		}, nextTrial.stimulusDurationMs);
	}

	function startPhase(nextPhase: 'practice' | 'main') {
		clearTimers();
		hasStarted = true;
		submitError = '';
		phase = nextPhase;
		currentIndex = 0;
		currentTrial = null;
		trialStartedAtMs = null;
		respondedThisTrial = false;
		isBetweenTrials = false;
		setImmersiveState();
		loadTrial(0);
	}

	function beginSession() {
		pendingResults = [];
		pendingPayload = initialPayload;
		submitted = !!initialPayload;
		interactive = initialInteractive && !initialPayload;
		if (config.practiceTrials.length > 0) {
			startPhase('practice');
			return;
		}

		startPhase('main');
	}

	function finalizeTrial(responded: boolean, reactionMs: number | null) {
		if (!currentTrial) return;
		clearTimers();

		const result = buildTrialResult({
			trial: currentTrial,
			responded,
			reactionMs
		});
		const completedTrial = currentTrial;
		pendingResults = [...pendingResults, result];
		currentTrial = null;
		trialStartedAtMs = null;
		respondedThisTrial = false;
		isBetweenTrials = true;

		interStimulusTimeout = setTimeout(() => {
			loadTrial(currentIndex + 1);
		}, completedTrial.interStimulusMs);
	}

	function handleResponse() {
		if (!interactive || !currentTrial || respondedThisTrial || phase === 'results') return;
		if (trialStartedAtMs === null) return;

		respondedThisTrial = true;
		finalizeTrial(true, Math.max(0, Date.now() - trialStartedAtMs));
	}

	async function persistPayload(payload: SustainedAttentionPayload) {
		isSubmitting = true;
		submitError = '';

		const result = await submitUIResponse({
			apiBase,
			instanceId,
			componentKey: 'SustainedAttentionTest',
			payload
		});

		if (!result.ok) {
			submitError = result.errorMessage ?? 'No se pudo guardar tu resultado. Reintenta el envio.';
			isSubmitting = false;
			return;
		}

		submitted = true;
		interactive = false;
		pendingPayload = payload;
		onPersistedResponse?.(payload as unknown as Record<string, unknown>);
		onRespond?.(payload.score);
		isSubmitting = false;
	}

	async function retrySubmit() {
		if (!pendingPayload || submitted || isSubmitting) return;
		await persistPayload(pendingPayload);
	}

	function handleDocumentKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space') return;
		event.preventDefault();
		handleResponse();
	}

	$effect(() => {
		setImmersiveState();
	});

	onDestroy(() => {
		clearTimers();
	});
</script>

<svelte:document onkeydown={handleDocumentKeydown} />

<div class="min-h-full rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(180deg,rgba(23,6,16,0.96),rgba(9,9,11,0.98))] text-white shadow-2xl">
	{#if phase === 'intro'}
		<div class="grid min-h-[70vh] gap-8 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-10">
			<div class="flex flex-col justify-center">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-amber-300">Go/No-Go</p>
				<h3 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{config.title}</h3>
				<p class="mt-4 max-w-2xl text-lg leading-8 text-slate-200">{config.instructions}</p>

				<div class="mt-8 grid gap-3 sm:grid-cols-3">
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Dificultad</p>
						<p class="mt-2 text-3xl font-black capitalize">{config.difficulty}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Practica</p>
						<p class="mt-2 text-3xl font-black">{config.practiceTrials.length}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Ensayos</p>
						<p class="mt-2 text-3xl font-black">{config.mainTrials.length}</p>
					</div>
				</div>

				<div class="mt-8 flex flex-wrap gap-3">
					<button
						type="button"
						class="rounded-2xl bg-amber-400 px-6 py-3 text-base font-black text-slate-950 transition-colors hover:bg-amber-300"
						onclick={beginSession}
					>
						{config.practiceTrials.length > 0 ? 'Empezar practica' : 'Empezar test'}
					</button>
					<div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
						No empieza hasta que pulses el boton.
					</div>
				</div>
			</div>

			<div class="rounded-[2rem] border border-amber-300/20 bg-slate-950/70 p-6 shadow-[0_0_80px_rgba(251,191,36,0.12)]">
				<p class="text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">Reglas</p>
				<div class="mt-5 space-y-4 text-base text-slate-200">
					<p>Pulsa <strong>espacio</strong> o haz <strong>click</strong> cuando aparezca <strong>{config.goStimulus}</strong>.</p>
					<p>No respondas cuando aparezca <strong>{config.noGoStimulus}</strong>.</p>
					<p>Al terminar veras score, errores de comision, omisiones y tiempo de reaccion medio.</p>
				</div>
			</div>
		</div>
	{:else if phase === 'practice-complete'}
		<div class="flex min-h-[70vh] flex-col items-center justify-center px-6 py-10 text-center">
			<p class="text-sm font-semibold uppercase tracking-[0.28em] text-amber-300">Practica completada</p>
			<h3 class="mt-4 text-4xl font-black sm:text-5xl">Ahora empieza el test real</h3>
			<p class="mt-4 max-w-2xl text-lg text-slate-200">
				Ya has visto la dinamica. La siguiente ronda cuenta para las metricas finales.
			</p>
			<div class="mt-8 flex flex-wrap justify-center gap-3">
				<button
					type="button"
					class="rounded-2xl bg-amber-400 px-6 py-3 text-base font-black text-slate-950 transition-colors hover:bg-amber-300"
					onclick={() => startPhase('main')}
				>
					Empezar test
				</button>
				<div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
					Responde solo al objetivo {config.goStimulus}.
				</div>
			</div>
		</div>
	{:else if phase === 'practice' || phase === 'main'}
		<div class="flex min-h-[70vh] flex-col px-5 py-5 sm:px-8 sm:py-8">
			<div class="grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/6 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
				<div>
					<p class="text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">
						{phase === 'practice' ? 'Modo practica' : 'Test principal'}
					</p>
					<h3 class="mt-2 text-2xl font-black sm:text-3xl">{config.title}</h3>
				</div>
				<div class="rounded-3xl border border-amber-300/20 bg-slate-950/60 px-5 py-3 text-center shadow-inner">
					<p class="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Ensayo</p>
					<p class="mt-1 text-4xl font-black">{currentIndex + 1}/{activeTrials.length}</p>
				</div>
			</div>

			<div class="mt-6 flex flex-1 flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950/60 p-6 text-center shadow-[0_24px_120px_rgba(15,23,42,0.7)] sm:p-10">
				<p class="text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">Responde al objetivo</p>
				<div class="mt-6 flex h-64 w-full max-w-3xl items-center justify-center rounded-[2rem] border border-amber-300/20 bg-[radial-gradient(circle,_rgba(251,191,36,0.2),_rgba(15,23,42,0.1))] shadow-[0_0_80px_rgba(251,191,36,0.14)]">
					{#if currentTrial}
						<div class="text-7xl font-black tracking-tight sm:text-8xl">{currentTrial.stimulus}</div>
					{:else if isBetweenTrials}
						<div class="space-y-3 text-center">
							<p class="text-sm font-semibold uppercase tracking-[0.28em] text-amber-200">Siguiente ensayo</p>
							<div class="text-5xl font-black text-slate-200 sm:text-6xl">Preparado</div>
							<p class="text-base text-slate-300">Espera a que aparezca el siguiente estimulo.</p>
						</div>
					{:else}
						<div class="text-5xl font-black text-slate-300">...</div>
					{/if}
				</div>

				<div class="mt-8 grid gap-3 sm:grid-cols-3">
					<div class="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Objetivo</p>
						<p class="mt-2 text-2xl font-black">{config.goStimulus}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Inhibir</p>
						<p class="mt-2 text-2xl font-black">{config.noGoStimulus}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Input</p>
						<p class="mt-2 text-2xl font-black">Espacio / Click</p>
					</div>
				</div>

				<button
					type="button"
					class="mt-8 rounded-[1.75rem] border border-amber-300/30 bg-amber-400/15 px-8 py-4 text-xl font-black text-amber-50 transition-colors hover:bg-amber-400/25"
					onclick={handleResponse}
				>
					Responder ahora
				</button>
			</div>
		</div>
	{:else}
		<div class="px-5 py-6 sm:px-8 sm:py-8">
			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 sm:p-8">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p class="text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">Resultado final</p>
						<h3 class="mt-2 text-3xl font-black sm:text-4xl">{config.title}</h3>
					</div>
					<div class="rounded-full bg-amber-300/15 px-4 py-2 text-base font-black text-amber-100">
						{scorePercent}%
					</div>
				</div>

				<div class="mt-6 grid gap-3 md:grid-cols-5">
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Aciertos</p>
						<p class="mt-2 text-3xl font-black">{effectivePayload.hits}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Comision</p>
						<p class="mt-2 text-3xl font-black">{effectivePayload.commissionErrors}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Omisiones</p>
						<p class="mt-2 text-3xl font-black">{effectivePayload.omissionErrors}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">RT medio</p>
						<p class="mt-2 text-3xl font-black">
							{#if effectivePayload.meanReactionMs !== null}
								{effectivePayload.meanReactionMs}ms
							{:else}
								-
							{/if}
						</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Ensayos</p>
						<p class="mt-2 text-3xl font-black">{effectivePayload.totalTrials}</p>
					</div>
				</div>

				{#if submitError}
					<div class="mt-5 rounded-3xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
						{submitError}
						<div class="mt-3">
							<button
								type="button"
								class="rounded-2xl bg-rose-500 px-4 py-2 font-semibold text-white hover:bg-rose-400"
								disabled={isSubmitting || submitted}
								onclick={retrySubmit}
							>
								{isSubmitting ? 'Reintentando...' : 'Reintentar envio'}
							</button>
						</div>
					</div>
				{/if}

				<div class="mt-5 rounded-3xl border border-white/10 bg-slate-950/50 p-5 text-sm text-slate-200">
					<p>El score resume aciertos y rechazos correctos sobre el total de ensayos principales.</p>
					{#if hasStarted && practiceCompleted}
						<p class="mt-2 text-slate-300">
							La practica sirvio solo para familiarizarse con el formato y no afecta al resultado final.
						</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
