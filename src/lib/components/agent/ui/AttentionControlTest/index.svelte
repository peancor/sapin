<script lang="ts">
	import { onDestroy } from 'svelte';
	import { submitUIResponse } from '../shared/ui-response';
	import {
		buildAttentionControlPayload,
		buildAttentionControlTrialLog,
		parseInitialAttentionControlPayload,
		resolveAttentionControlConfig,
		type AttentionControlPayload,
		type AttentionControlResponse,
		type AttentionControlTrial,
		type AttentionControlTrialLog,
		type StroopColor
	} from '../shared/attention-control';
	import {
		formatDifficultyLabel,
		formatPercent,
		type ImmersiveState
	} from '../shared/cognitive-tests';

	interface Props {
		instanceId: string;
		title?: string;
		testType?: 'go_no_go' | 'stroop' | 'flanker' | 'sdmt';
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
		return resolveAttentionControlConfig({
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
	const initialPayload = (() => parseInitialAttentionControlPayload(initialUserResponse))();

	let phase = $state<'intro' | 'practice' | 'practice-complete' | 'main' | 'results'>(
		initialPayload ? 'results' : 'intro'
	);
	let interactive = $state((() => initialInteractive && !initialPayload && config.testType !== 'sdmt')());
	let currentTrial = $state<AttentionControlTrial | null>(null);
	let currentIndex = $state(0);
	let respondedThisTrial = $state(false);
	let isBetweenTrials = $state(false);
	let trialStartedAtMs = $state<number | null>(null);
	let pendingTrialLog = $state<AttentionControlTrialLog[]>(initialPayload?.trialLog ?? []);
	let isSubmitting = $state(false);
	let submitError = $state('');
	let submitted = $state(!!initialPayload);
	let pendingPayload = $state<AttentionControlPayload | null>(initialPayload);
	let trialTimeout: ReturnType<typeof setTimeout> | null = null;
	let interTrialTimeout: ReturnType<typeof setTimeout> | null = null;

	const activeTrials = $derived(
		phase === 'practice' ? config.practiceTrials : phase === 'main' ? config.mainTrials : []
	);
	const effectivePayload = $derived(
		initialPayload ??
			buildAttentionControlPayload({
				testType: config.testType,
				difficulty: config.difficulty,
				trialLog: pendingTrialLog
			})
	);
	const progressLabel = $derived(
		activeTrials.length > 0 && phase !== 'results'
			? `${Math.min(currentIndex + (currentTrial ? 1 : 0), activeTrials.length)}/${activeTrials.length}`
			: `${effectivePayload.summary.totalTrials}`
	);

	function setImmersiveState() {
		onImmersiveStateChange?.({
			canCloseSafely:
				phase === 'intro' ||
				phase === 'results' ||
				phase === 'practice-complete' ||
				config.testType === 'sdmt',
			closePrompt: 'Si sales ahora se perdera la sesion cognitiva en curso. ¿Quieres cerrar?'
		});
	}

	function clearTimers() {
		if (trialTimeout !== null) {
			clearTimeout(trialTimeout);
			trialTimeout = null;
		}
		if (interTrialTimeout !== null) {
			clearTimeout(interTrialTimeout);
			interTrialTimeout = null;
		}
	}

	function resetSession() {
		clearTimers();
		pendingTrialLog = [];
		pendingPayload = initialPayload;
		submitted = !!initialPayload;
		interactive = initialInteractive && !initialPayload && config.testType !== 'sdmt';
		submitError = '';
		currentTrial = null;
		currentIndex = 0;
		respondedThisTrial = false;
		isBetweenTrials = false;
		trialStartedAtMs = null;
	}

	function loadTrial(index: number) {
		const trials = phase === 'practice' ? config.practiceTrials : config.mainTrials;
		const nextTrial = trials[index] ?? null;
		if (!nextTrial) {
			if (phase === 'practice') {
				currentTrial = null;
				isBetweenTrials = false;
				phase = 'practice-complete';
				setImmersiveState();
				return;
			}

			currentTrial = null;
			isBetweenTrials = false;
			phase = 'results';
			const payload = buildAttentionControlPayload({
				testType: config.testType,
				difficulty: config.difficulty,
				trialLog: pendingTrialLog
			});
			pendingPayload = payload;
			if (interactive) {
				void persistPayload(payload);
			}
			setImmersiveState();
			return;
		}

		currentIndex = index;
		currentTrial = nextTrial;
		respondedThisTrial = false;
		isBetweenTrials = false;
		trialStartedAtMs = Date.now();

		trialTimeout = setTimeout(() => {
			finalizeTrial(null, null);
		}, nextTrial.stimulusDurationMs);
	}

	function startPhase(nextPhase: 'practice' | 'main') {
		clearTimers();
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
		resetSession();
		if (config.practiceTrials.length > 0) {
			startPhase('practice');
			return;
		}
		startPhase('main');
	}

	function finalizeTrial(
		actualResponse: AttentionControlResponse,
		reactionMs: number | null
	) {
		if (!currentTrial || trialStartedAtMs === null) return;
		clearTimers();
		const finishedAtMs = Date.now();
		const log = buildAttentionControlTrialLog({
			trial: currentTrial,
			actualResponse,
			reactionMs,
			stimulusStartedAtMs: trialStartedAtMs,
			stimulusEndedAtMs: finishedAtMs
		});
		pendingTrialLog = [...pendingTrialLog, log];
		currentTrial = null;
		trialStartedAtMs = null;
		respondedThisTrial = false;
		isBetweenTrials = true;

		interTrialTimeout = setTimeout(() => {
			loadTrial(currentIndex + 1);
		}, activeTrials[currentIndex]?.interStimulusMs ?? 600);
	}

	function handleResponse(response: AttentionControlResponse) {
		if (!interactive || !currentTrial || respondedThisTrial || phase === 'results') return;
		if (trialStartedAtMs === null) return;
		respondedThisTrial = true;
		finalizeTrial(response, Math.max(0, Date.now() - trialStartedAtMs));
	}

	async function persistPayload(payload: AttentionControlPayload) {
		isSubmitting = true;
		submitError = '';
		const result = await submitUIResponse({
			apiBase,
			instanceId,
			componentKey: 'AttentionControlTest',
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
		if (!interactive || !currentTrial) return;
		if (config.testType === 'go_no_go' && event.code === 'Space') {
			event.preventDefault();
			handleResponse('respond');
			return;
		}

		if (config.testType === 'stroop') {
			const index =
				event.code === 'Digit1' || event.code === 'Numpad1'
					? 0
					: event.code === 'Digit2' || event.code === 'Numpad2'
						? 1
						: event.code === 'Digit3' || event.code === 'Numpad3'
							? 2
							: event.code === 'Digit4' || event.code === 'Numpad4'
								? 3
								: -1;
			if (index >= 0) {
				event.preventDefault();
				handleResponse(['rojo', 'azul', 'verde', 'amarillo'][index] as StroopColor);
			}
			return;
		}

		if (config.testType === 'flanker') {
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				handleResponse('left');
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				handleResponse('right');
			}
		}
	}

	function getStroopToneClass(color: StroopColor): string {
		if (color === 'rojo') return 'text-rose-400';
		if (color === 'azul') return 'text-sky-400';
		if (color === 'verde') return 'text-emerald-400';
		return 'text-amber-300';
	}

	function getStroopButtonClass(color: StroopColor): string {
		if (color === 'rojo') return 'border-rose-300/40 bg-rose-500/18 text-rose-50';
		if (color === 'azul') return 'border-sky-300/40 bg-sky-500/18 text-sky-50';
		if (color === 'verde') return 'border-emerald-300/40 bg-emerald-500/18 text-emerald-50';
		return 'border-amber-300/40 bg-amber-400/18 text-amber-50';
	}

	function getSummaryItems() {
		const summary = effectivePayload.summary;
		if (effectivePayload.testType === 'go_no_go') {
			return [
				{ label: 'Score', value: formatPercent(effectivePayload.score) },
				{ label: 'Comision', value: `${summary.commissionErrors ?? 0}` },
				{ label: 'Omisiones', value: `${summary.omissionErrors ?? 0}` },
				{
					label: 'RT media',
					value: typeof summary.meanReactionMs === 'number' ? `${summary.meanReactionMs} ms` : 'N/D'
				}
			];
		}

		return [
			{ label: 'Score', value: formatPercent(effectivePayload.score) },
			{ label: 'Precision', value: formatPercent(summary.accuracy) },
			{
				label: effectivePayload.testType === 'stroop' ? 'Interference' : 'Conflict',
				value:
					typeof (effectivePayload.testType === 'stroop'
						? summary.interferenceCost
						: summary.conflictCost) === 'number'
						? `${effectivePayload.testType === 'stroop' ? summary.interferenceCost : summary.conflictCost} ms`
						: 'N/D'
			},
			{
				label: 'RT media',
				value: typeof summary.meanReactionMs === 'number' ? `${summary.meanReactionMs} ms` : 'N/D'
			}
		];
	}

	$effect(() => {
		setImmersiveState();
	});

	onDestroy(() => {
		clearTimers();
	});
</script>

<svelte:document onkeydown={handleDocumentKeydown} />

<div class="min-h-full rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(244,114,182,0.18),_transparent_28%),linear-gradient(180deg,rgba(27,12,26,0.96),rgba(7,8,18,0.99))] text-white shadow-2xl">
	{#if config.testType === 'sdmt'}
		<div class="grid min-h-[70vh] gap-8 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-10">
			<div class="flex flex-col justify-center">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-fuchsia-300">
					Attention Control
				</p>
				<h3 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{config.title}</h3>
				<p class="mt-4 max-w-2xl text-lg leading-8 text-slate-200">{config.instructions}</p>
				<div class="mt-8 grid gap-3 sm:grid-cols-3">
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Estado</p>
						<p class="mt-2 text-3xl font-black">Preparado</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Familia</p>
						<p class="mt-2 text-3xl font-black">SDMT</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Siguiente</p>
						<p class="mt-2 text-3xl font-black">v2</p>
					</div>
				</div>
			</div>

			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl">
				<p class="text-sm font-semibold uppercase tracking-[0.22em] text-fuchsia-200">Roadmap</p>
				<div class="mt-6 space-y-4">
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Clave simbolo-digito</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							La siguiente iteracion mostrara una clave persistente y una secuencia de simbolos aislados para responder con keypad numerico.
						</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Metricas previstas</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							Se guardaran aciertos, errores, velocidad por bloque y log por ensayo sin cambiar el contrato del chat.
						</p>
					</div>
				</div>
			</div>
		</div>
	{:else if phase === 'intro'}
		<div class="grid min-h-[70vh] gap-8 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-10">
			<div class="flex flex-col justify-center">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-fuchsia-300">
					{config.testType === 'go_no_go'
						? 'Atencion e inhibicion'
						: config.testType === 'flanker'
							? 'Atencion selectiva'
							: 'Control inhibitorio'}
				</p>
				<h3 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{config.title}</h3>
				<p class="mt-4 max-w-2xl text-lg leading-8 text-slate-200">{config.instructions}</p>

				<div class="mt-8 grid gap-3 sm:grid-cols-3">
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
							Dificultad
						</p>
						<p class="mt-2 text-3xl font-black">{formatDifficultyLabel(config.difficulty)}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
							Practica
						</p>
						<p class="mt-2 text-3xl font-black">{config.practiceTrials.length}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
							Ensayos
						</p>
						<p class="mt-2 text-3xl font-black">{config.mainTrials.length}</p>
					</div>
				</div>

				{#if interactive}
					<div class="mt-10 flex flex-wrap gap-4">
						<button
							type="button"
							class="inline-flex items-center rounded-2xl bg-white px-6 py-3 text-base font-bold text-slate-950 shadow-lg transition hover:translate-y-[-1px]"
							onclick={beginSession}
						>
							Empezar
						</button>
					</div>
				{/if}
			</div>

			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl">
				<p class="text-sm font-semibold uppercase tracking-[0.22em] text-fuchsia-200">Controles</p>
				<div class="mt-6 space-y-4">
					{#if config.testType === 'go_no_go'}
						<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
							<h4 class="text-xl font-semibold">Responde solo al objetivo</h4>
							<p class="mt-2 text-sm leading-7 text-slate-300">
								Pulsa espacio o toca el boton cuando aparezca <span class="font-semibold text-emerald-300">{config.goStimulus}</span>. No respondas cuando veas <span class="font-semibold text-rose-300">{config.noGoStimulus}</span>.
							</p>
						</div>
					{:else if config.testType === 'stroop'}
						<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
							<h4 class="text-xl font-semibold">Ignora la palabra</h4>
							<p class="mt-2 text-sm leading-7 text-slate-300">
								Elige el color de la tinta. Puedes usar las teclas 1-4 o tocar uno de los botones cromaticos.
							</p>
						</div>
					{:else}
						<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
							<h4 class="text-xl font-semibold">Foco en la flecha central</h4>
							<p class="mt-2 text-sm leading-7 text-slate-300">
								Usa las flechas izquierda/derecha o los botones grandes inferiores para indicar la direccion correcta.
							</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{:else if phase === 'practice-complete'}
		<div class="flex min-h-[70vh] items-center justify-center px-6 py-8">
			<div class="max-w-2xl rounded-[2rem] border border-white/10 bg-white/6 p-8 text-center shadow-xl">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-fuchsia-200">Practica completada</p>
				<h3 class="mt-4 text-4xl font-black">Empieza la fase principal</h3>
				<p class="mt-4 text-lg leading-8 text-slate-200">
					Ahora se registraran las metricas finales del test. Mantente concentrado y responde con decision.
				</p>
				<button
					type="button"
					class="mt-8 inline-flex items-center rounded-2xl bg-white px-6 py-3 text-base font-bold text-slate-950 shadow-lg transition hover:translate-y-[-1px]"
					onclick={() => startPhase('main')}
				>
					Comenzar fase principal
				</button>
			</div>
		</div>
	{:else if phase === 'practice' || phase === 'main'}
		<div class="flex min-h-[76vh] flex-col px-4 py-4 sm:px-6 sm:py-6">
			<div class="grid gap-3 sm:grid-cols-3">
				<div class="rounded-3xl border border-white/10 bg-white/6 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Fase</p>
					<p class="mt-2 text-2xl font-black">{phase === 'practice' ? 'Practica' : 'Principal'}</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-white/6 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Progreso</p>
					<p class="mt-2 text-2xl font-black">{progressLabel}</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-white/6 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Test</p>
					<p class="mt-2 text-2xl font-black">
						{config.testType === 'go_no_go'
							? 'Go/No-Go'
							: config.testType === 'flanker'
								? 'Flanker'
								: 'Stroop'}
					</p>
				</div>
			</div>

			<div class="mt-4 flex min-h-0 flex-1 flex-col justify-between gap-6 rounded-[2rem] border border-white/10 bg-black/20 p-4 sm:p-6">
				<div class="flex justify-center text-center">
					{#if isBetweenTrials || !currentTrial}
						<div class="flex min-h-[38vh] items-center justify-center">
							<div>
								<p class="text-xs font-semibold uppercase tracking-[0.28em] text-fuchsia-200">Preparado</p>
								<h3 class="mt-4 text-5xl font-black sm:text-7xl">Siguiente ensayo</h3>
								<p class="mt-4 text-lg text-slate-300">Mantente atento al proximo estimulo.</p>
							</div>
						</div>
					{:else if currentTrial.stimulus.kind === 'go_no_go'}
						<div class="flex min-h-[38vh] items-center justify-center">
							<div
								class={`flex h-64 w-64 items-center justify-center rounded-full border text-5xl font-black shadow-2xl sm:h-80 sm:w-80 sm:text-7xl ${
									currentTrial.stimulus.tone === 'go'
										? 'border-emerald-300/60 bg-emerald-400/20 text-emerald-50 shadow-emerald-500/30'
										: 'border-rose-300/60 bg-rose-500/18 text-rose-50 shadow-rose-500/25'
								}`}
							>
								{currentTrial.stimulus.label}
							</div>
						</div>
					{:else if currentTrial.stimulus.kind === 'stroop'}
						<div class="flex min-h-[38vh] items-center justify-center">
							<div class={`text-6xl font-black uppercase tracking-[0.12em] sm:text-8xl ${getStroopToneClass(currentTrial.stimulus.inkColor)}`}>
								{currentTrial.stimulus.word}
							</div>
						</div>
					{:else}
						<div class="flex min-h-[38vh] items-center justify-center">
							<div class="font-mono text-7xl font-black tracking-[0.18em] text-cyan-200 sm:text-9xl">
								{currentTrial.stimulus.pattern}
							</div>
						</div>
					{/if}
				</div>

				<div class="space-y-4">
					{#if config.testType === 'go_no_go'}
						<button
							type="button"
							class="flex h-20 w-full items-center justify-center rounded-[1.8rem] border border-white/10 bg-white/10 text-2xl font-black text-white transition hover:border-white/30 hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-40"
							onclick={() => handleResponse('respond')}
							disabled={!currentTrial || isBetweenTrials}
						>
							Responder
						</button>
						<p class="text-center text-sm text-slate-300">Espacio o click</p>
					{:else if config.testType === 'stroop'}
						<div class="grid gap-3 sm:grid-cols-2">
							{#each ['rojo', 'azul', 'verde', 'amarillo'] as color, index (color)}
								<button
									type="button"
									class={`flex min-h-20 items-center justify-between rounded-[1.6rem] border px-5 py-4 text-left text-xl font-black uppercase tracking-[0.08em] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40 ${getStroopButtonClass(color as StroopColor)}`}
									onclick={() => handleResponse(color as StroopColor)}
									disabled={!currentTrial || isBetweenTrials}
								>
									<span>{color}</span>
									<span class="text-sm opacity-70">{index + 1}</span>
								</button>
							{/each}
						</div>
					{:else}
						<div class="grid gap-3 sm:grid-cols-2">
							<button
								type="button"
								class="flex min-h-24 items-center justify-between rounded-[1.8rem] border border-cyan-300/35 bg-cyan-500/15 px-5 py-4 text-left text-2xl font-black text-cyan-50 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
								onclick={() => handleResponse('left')}
								disabled={!currentTrial || isBetweenTrials}
							>
								<span>Izquierda</span>
								<span class="text-sm opacity-70">←</span>
							</button>
							<button
								type="button"
								class="flex min-h-24 items-center justify-between rounded-[1.8rem] border border-cyan-300/35 bg-cyan-500/15 px-5 py-4 text-left text-2xl font-black text-cyan-50 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
								onclick={() => handleResponse('right')}
								disabled={!currentTrial || isBetweenTrials}
							>
								<span>Derecha</span>
								<span class="text-sm opacity-70">→</span>
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<div class="grid min-h-[70vh] gap-6 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-10">
			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-fuchsia-200">Resultados</p>
				<h3 class="mt-4 text-4xl font-black">{config.title}</h3>
				<p class="mt-4 text-lg leading-8 text-slate-200">
					Score {formatPercent(effectivePayload.score)} con {effectivePayload.summary.totalTrials} ensayos principales.
				</p>

				<div class="mt-8 grid gap-3 sm:grid-cols-2">
					{#each getSummaryItems() as item (item.label)}
						<div class="rounded-3xl border border-white/10 bg-slate-950/30 p-4">
							<p class="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
								{item.label}
							</p>
							<p class="mt-2 text-3xl font-black">{item.value}</p>
						</div>
					{/each}
				</div>

				{#if submitError}
					<div class="mt-6 rounded-2xl border border-rose-300/30 bg-rose-500/12 p-4 text-sm text-rose-100">
						<p>{submitError}</p>
						<button
							type="button"
							class="mt-3 inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950"
							onclick={() => void retrySubmit()}
						>
							Reintentar envio
						</button>
					</div>
				{/if}
			</div>

			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl">
				<p class="text-sm font-semibold uppercase tracking-[0.22em] text-fuchsia-200">Lectura rapida</p>
				<div class="mt-6 space-y-4">
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Precision</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							{formatPercent(effectivePayload.summary.accuracy)} de aciertos en la fase principal.
						</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Ensayos guardados</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							{effectivePayload.trialLog.length} ensayos registrados entre practica y fase principal.
						</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Tiempo de reaccion</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							{typeof effectivePayload.summary.meanReactionMs === 'number'
								? `${effectivePayload.summary.meanReactionMs} ms de media en respuestas correctas.`
								: 'Sin tiempos validos suficientes para calcular media.'}
						</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
