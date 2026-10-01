<script lang="ts">
	import { onDestroy } from 'svelte';
	import { submitUIResponse } from '../shared/ui-response';
	import {
		buildDigitSpanTrial,
		buildDigitSpanTrialLog,
		buildWorkingMemoryPayload,
		parseInitialWorkingMemoryPayload,
		resolveWorkingMemoryConfig,
		type DigitSpanTrial,
		type DigitSpanTrialLog,
		type WorkingMemoryPayload
	} from '../shared/working-memory';
	import {
		formatDifficultyLabel,
		formatPercent,
		type ImmersiveState
	} from '../shared/cognitive-tests';

	interface Props {
		instanceId: string;
		title?: string;
		testType?: 'digit_span';
		mode?: 'forward' | 'backward' | 'both';
		difficulty?: 'easy' | 'medium' | 'hard';
		instructions?: string;
		startLength?: number;
		maxLength?: number;
		trialsPerLength?: number;
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
		mode,
		difficulty,
		instructions,
		startLength,
		maxLength,
		trialsPerLength,
		interactive: initialInteractive,
		initialUserResponse,
		apiBase,
		onRespond,
		onPersistedResponse,
		onImmersiveStateChange
	}: Props = $props();

	function createResolvedConfig() {
		return resolveWorkingMemoryConfig({
			title,
			testType,
			mode,
			difficulty,
			instructions,
			startLength,
			maxLength,
			trialsPerLength
		});
	}

	const config = createResolvedConfig();
	const initialPayload = (() => parseInitialWorkingMemoryPayload(initialUserResponse))();
	const activeModes = config.mode === 'both' ? (['forward', 'backward'] as const) : ([config.mode] as const);

	let phase = $state<'intro' | 'practice' | 'practice-complete' | 'main' | 'results'>(
		initialPayload ? 'results' : 'intro'
	);
	let stage = $state<'showing' | 'input' | 'feedback'>('showing');
	let interactive = $state((() => initialInteractive && !initialPayload)());
	let currentTrial = $state<DigitSpanTrial | null>(null);
	let practiceIndex = $state(0);
	let pendingTrialLog = $state<DigitSpanTrialLog[]>(initialPayload?.trialLog ?? []);
	let displayedDigit = $state<string | null>(null);
	let inputDigits = $state<number[]>([]);
	let stimulusStartedAtMs = $state<number | null>(null);
	let inputStartedAtMs = $state<number | null>(null);
	let lastResult = $state<DigitSpanTrialLog | null>(null);
	let isSubmitting = $state(false);
	let submitError = $state('');
	let submitted = $state(!!initialPayload);
	let pendingPayload = $state<WorkingMemoryPayload | null>(initialPayload);

	let mainModeIndex = $state(0);
	let mainLength = $state(config.startLength);
	let mainAttemptIndex = $state(0);
	let mainCorrectAtLength = $state(0);
	let mainSequenceSalt = $state(0);

	let digitTimeout: ReturnType<typeof setTimeout> | null = null;
	let blankTimeout: ReturnType<typeof setTimeout> | null = null;
	let nextTrialTimeout: ReturnType<typeof setTimeout> | null = null;

	const effectivePayload = $derived(
		initialPayload ??
			buildWorkingMemoryPayload({
				difficulty: config.difficulty,
				mode: config.mode,
				trialLog: pendingTrialLog
			})
	);
	const currentModeLabel = $derived(
		currentTrial?.mode === 'backward' ? 'Inverso' : currentTrial?.mode === 'forward' ? 'Directo' : 'Preparado'
	);

	function setImmersiveState() {
		onImmersiveStateChange?.({
			canCloseSafely:
				phase === 'intro' || phase === 'results' || phase === 'practice-complete',
			closePrompt: 'Si sales ahora se perdera la sesion de memoria de trabajo en curso. ¿Quieres cerrar?'
		});
	}

	function clearTimers() {
		if (digitTimeout !== null) {
			clearTimeout(digitTimeout);
			digitTimeout = null;
		}
		if (blankTimeout !== null) {
			clearTimeout(blankTimeout);
			blankTimeout = null;
		}
		if (nextTrialTimeout !== null) {
			clearTimeout(nextTrialTimeout);
			nextTrialTimeout = null;
		}
	}

	function resetSession() {
		clearTimers();
		interactive = initialInteractive && !initialPayload;
		pendingTrialLog = [];
		pendingPayload = initialPayload;
		submitted = !!initialPayload;
		submitError = '';
		practiceIndex = 0;
		currentTrial = null;
		stage = 'showing';
		displayedDigit = null;
		inputDigits = [];
		stimulusStartedAtMs = null;
		inputStartedAtMs = null;
		lastResult = null;
		mainModeIndex = 0;
		mainLength = config.startLength;
		mainAttemptIndex = 0;
		mainCorrectAtLength = 0;
		mainSequenceSalt = 0;
	}

	function presentTrial(trial: DigitSpanTrial) {
		clearTimers();
		currentTrial = trial;
		stage = 'showing';
		displayedDigit = null;
		inputDigits = [];
		inputStartedAtMs = null;
		stimulusStartedAtMs = Date.now();
		lastResult = null;

		function showDigit(index: number) {
			const trial = currentTrial;
			if (!trial) return;
			if (index >= trial.sequence.length) {
				stage = 'input';
				displayedDigit = null;
				inputStartedAtMs = Date.now();
				return;
			}

			displayedDigit = String(trial.sequence[index]);
			digitTimeout = setTimeout(() => {
				displayedDigit = null;
				blankTimeout = setTimeout(() => showDigit(index + 1), trial.digitGapMs);
			}, trial.digitDisplayMs);
		}

		showDigit(0);
	}

	function createMainTrial(): DigitSpanTrial {
		return buildDigitSpanTrial({
			phase: 'main',
			mode: activeModes[mainModeIndex],
			modeIndex: mainModeIndex,
			length: mainLength,
			attemptIndex: mainAttemptIndex + mainSequenceSalt,
			digitDisplayMs: config.digitDisplayMs,
			digitGapMs: config.digitGapMs,
			interTrialMs: config.interTrialMs
		});
	}

	function startPractice() {
		phase = 'practice';
		practiceIndex = 0;
		setImmersiveState();
		presentTrial(config.practiceTrials[0]);
	}

	function startMain() {
		phase = 'main';
		mainModeIndex = 0;
		mainLength = config.startLength;
		mainAttemptIndex = 0;
		mainCorrectAtLength = 0;
		mainSequenceSalt = 0;
		setImmersiveState();
		presentTrial(createMainTrial());
	}

	function beginSession() {
		resetSession();
		if (config.practiceTrials.length > 0) {
			startPractice();
			return;
		}
		startMain();
	}

	function moveToNextMainTrial(wasCorrect: boolean) {
		mainCorrectAtLength = wasCorrect ? mainCorrectAtLength + 1 : mainCorrectAtLength;
		const finishedAttempts = mainAttemptIndex + 1 >= config.trialsPerLength;
		const lengthSucceeded = (wasCorrect ? mainCorrectAtLength + 1 : mainCorrectAtLength) > 0;

		if (!finishedAttempts) {
			mainAttemptIndex += 1;
			mainSequenceSalt += 1;
			presentTrial(createMainTrial());
			return;
		}

		if (lengthSucceeded && mainLength < config.maxLength) {
			mainLength += 1;
			mainAttemptIndex = 0;
			mainCorrectAtLength = 0;
			mainSequenceSalt += 1;
			presentTrial(createMainTrial());
			return;
		}

		if (mainModeIndex < activeModes.length - 1) {
			mainModeIndex += 1;
			mainLength = config.startLength;
			mainAttemptIndex = 0;
			mainCorrectAtLength = 0;
			mainSequenceSalt += 1;
			presentTrial(createMainTrial());
			return;
		}

		finishSession();
	}

	function finishSession() {
		clearTimers();
		currentTrial = null;
		displayedDigit = null;
		inputDigits = [];
		phase = 'results';
		stage = 'feedback';
		const payload = buildWorkingMemoryPayload({
			difficulty: config.difficulty,
			mode: config.mode,
			trialLog: pendingTrialLog
		});
		pendingPayload = payload;
		if (interactive) {
			void persistPayload(payload);
		}
		setImmersiveState();
	}

	function commitCurrentInput() {
		const trial = currentTrial;
		if (!interactive || !trial || stage !== 'input' || inputStartedAtMs === null) return;
		const interTrialMs = trial.interTrialMs;
		const log = buildDigitSpanTrialLog({
			trial,
			index: pendingTrialLog.filter((entry) => entry.phase === trial.phase).length,
			actualDigits: inputDigits,
			reactionMs: Math.max(0, Date.now() - inputStartedAtMs),
			stimulusStartedAtMs: stimulusStartedAtMs ?? Date.now(),
			stimulusEndedAtMs: Date.now()
		});
		lastResult = log;
		pendingTrialLog = [...pendingTrialLog, log];
		stage = 'feedback';
		currentTrial = null;
		displayedDigit = null;
		inputDigits = [];
		stimulusStartedAtMs = null;
		inputStartedAtMs = null;

		nextTrialTimeout = setTimeout(() => {
			if (phase === 'practice') {
				const nextIndex = practiceIndex + 1;
				if (nextIndex >= config.practiceTrials.length) {
					phase = 'practice-complete';
					setImmersiveState();
					return;
				}
				practiceIndex = nextIndex;
				presentTrial(config.practiceTrials[nextIndex]);
				return;
			}

			moveToNextMainTrial(log.outcome === 'correct');
		}, interTrialMs);
	}

	function handleDigitInput(value: number) {
		if (!interactive || stage !== 'input' || !currentTrial) return;
		if (inputDigits.length >= currentTrial.length) return;
		inputDigits = [...inputDigits, value];
	}

	function handleBackspace() {
		if (!interactive || stage !== 'input') return;
		inputDigits = inputDigits.slice(0, Math.max(0, inputDigits.length - 1));
	}

	async function persistPayload(payload: WorkingMemoryPayload) {
		isSubmitting = true;
		submitError = '';
		const result = await submitUIResponse({
			apiBase,
			instanceId,
			componentKey: 'WorkingMemoryTest',
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
		if (!interactive || stage !== 'input') return;
		if (/^[0-9]$/.test(event.key)) {
			event.preventDefault();
			handleDigitInput(Number(event.key));
			return;
		}
		if (event.key === 'Backspace') {
			event.preventDefault();
			handleBackspace();
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			commitCurrentInput();
		}
	}

	$effect(() => {
		setImmersiveState();
	});

	onDestroy(() => {
		clearTimers();
	});
</script>

<svelte:document onkeydown={handleDocumentKeydown} />

<div class="min-h-full rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(180deg,rgba(8,22,45,0.97),rgba(4,8,18,0.99))] text-white shadow-2xl">
	{#if phase === 'intro'}
		<div class="grid min-h-[70vh] gap-8 px-6 py-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:py-10">
			<div class="flex flex-col justify-center">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">Memoria de trabajo</p>
				<h3 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{config.title}</h3>
				<p class="mt-4 max-w-2xl text-lg leading-8 text-slate-200">{config.instructions}</p>

				<div class="mt-8 grid gap-3 sm:grid-cols-3">
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Dificultad</p>
						<p class="mt-2 text-3xl font-black">{formatDifficultyLabel(config.difficulty)}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Inicio</p>
						<p class="mt-2 text-3xl font-black">{config.startLength}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-white/6 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Maximo</p>
						<p class="mt-2 text-3xl font-black">{config.maxLength}</p>
					</div>
				</div>

				{#if interactive}
					<button
						type="button"
						class="mt-10 inline-flex w-fit items-center rounded-2xl bg-white px-6 py-3 text-base font-bold text-slate-950 shadow-lg transition hover:translate-y-[-1px]"
						onclick={beginSession}
					>
						Empezar
					</button>
				{/if}
			</div>

			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl">
				<p class="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200">Como funciona</p>
				<div class="mt-6 space-y-4">
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Presentacion secuencial</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							Veras los digitos uno a uno. Despues aparecera el keypad para introducir la secuencia.
						</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Modo actual</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							{config.mode === 'both'
								? 'La sesion combina una ronda directa y otra inversa.'
								: config.mode === 'backward'
									? 'Responde siempre en orden inverso.'
									: 'Responde siempre en el mismo orden presentado.'}
						</p>
					</div>
				</div>
			</div>
		</div>
	{:else if phase === 'practice-complete'}
		<div class="flex min-h-[70vh] items-center justify-center px-6 py-8">
			<div class="max-w-2xl rounded-[2rem] border border-white/10 bg-white/6 p-8 text-center shadow-xl">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-sky-200">Practica completada</p>
				<h3 class="mt-4 text-4xl font-black">Empieza la prueba principal</h3>
				<p class="mt-4 text-lg leading-8 text-slate-200">
					Ahora se calculara tu span maximo y la precision por longitud.
				</p>
				<button
					type="button"
					class="mt-8 inline-flex items-center rounded-2xl bg-white px-6 py-3 text-base font-bold text-slate-950 shadow-lg transition hover:translate-y-[-1px]"
					onclick={startMain}
				>
					Comenzar fase principal
				</button>
			</div>
		</div>
	{:else if phase === 'practice' || phase === 'main'}
		<div class="flex min-h-[76vh] flex-col px-4 py-4 sm:px-6 sm:py-6">
			<div class="grid gap-3 sm:grid-cols-4">
				<div class="rounded-3xl border border-white/10 bg-white/6 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Fase</p>
					<p class="mt-2 text-2xl font-black">{phase === 'practice' ? 'Practica' : 'Principal'}</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-white/6 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Modo</p>
					<p class="mt-2 text-2xl font-black">{currentModeLabel}</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-white/6 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Longitud</p>
					<p class="mt-2 text-2xl font-black">{currentTrial?.length ?? '-'}</p>
				</div>
				<div class="rounded-3xl border border-white/10 bg-white/6 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Intento</p>
					<p class="mt-2 text-2xl font-black">
						{phase === 'practice'
							? `${practiceIndex + 1}/${config.practiceTrials.length}`
							: `${mainAttemptIndex + 1}/${config.trialsPerLength}`}
					</p>
				</div>
			</div>

			<div class="mt-4 flex min-h-0 flex-1 flex-col gap-6 rounded-[2rem] border border-white/10 bg-black/20 p-4 sm:p-6">
				<div class="flex min-h-[34vh] items-center justify-center rounded-[1.8rem] border border-white/10 bg-slate-950/35 text-center">
					{#if stage === 'showing'}
						<div>
							<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">Memoriza</p>
							<div class="mt-4 text-7xl font-black sm:text-9xl">{displayedDigit ?? '•'}</div>
						</div>
					{:else if stage === 'input'}
						<div class="w-full max-w-2xl px-4">
							<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">Respuesta</p>
							<h3 class="mt-4 text-4xl font-black sm:text-6xl">
								{inputDigits.length > 0 ? inputDigits.join(' ') : '____'}
							</h3>
							<p class="mt-4 text-sm text-slate-300">
								{currentTrial?.mode === 'backward'
									? 'Introduce la secuencia en orden inverso.'
									: 'Introduce la secuencia en el mismo orden.'}
							</p>
						</div>
					{:else}
						<div class="px-4">
							<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">Feedback</p>
							<h3 class="mt-4 text-4xl font-black sm:text-6xl">
								{lastResult?.outcome === 'correct' ? 'Correcto' : 'Intentalo de nuevo'}
							</h3>
							{#if lastResult}
								<p class="mt-4 text-sm leading-7 text-slate-300">
									Secuencia esperada: {lastResult.expectedResponse.split('').join(' ')}
								</p>
							{/if}
						</div>
					{/if}
				</div>

				<div class="grid gap-3 sm:grid-cols-3">
					{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as digit (digit)}
						<button
							type="button"
							class="flex min-h-20 items-center justify-center rounded-[1.6rem] border border-sky-300/35 bg-sky-500/15 text-2xl font-black text-sky-50 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-30"
							onclick={() => handleDigitInput(digit)}
							disabled={stage !== 'input' || !currentTrial}
						>
							{digit}
						</button>
					{/each}
					<button
						type="button"
						class="flex min-h-20 items-center justify-center rounded-[1.6rem] border border-white/15 bg-white/8 text-xl font-bold text-slate-100 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-30"
						onclick={handleBackspace}
						disabled={stage !== 'input'}
					>
						Borrar
					</button>
					<button
						type="button"
						class="flex min-h-20 items-center justify-center rounded-[1.6rem] border border-sky-300/35 bg-sky-500/15 text-2xl font-black text-sky-50 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-30"
						onclick={() => handleDigitInput(0)}
						disabled={stage !== 'input' || !currentTrial}
					>
						0
					</button>
					<button
						type="button"
						class="flex min-h-20 items-center justify-center rounded-[1.6rem] border border-emerald-300/35 bg-emerald-500/18 text-xl font-black text-emerald-50 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-30"
						onclick={commitCurrentInput}
						disabled={stage !== 'input' || !currentTrial || inputDigits.length === 0}
					>
						Confirmar
					</button>
				</div>
			</div>
		</div>
	{:else}
		<div class="grid min-h-[70vh] gap-6 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-10">
			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl">
				<p class="text-sm font-semibold uppercase tracking-[0.28em] text-sky-200">Resultados</p>
				<h3 class="mt-4 text-4xl font-black">{config.title}</h3>
				<p class="mt-4 text-lg leading-8 text-slate-200">
					Score {formatPercent(effectivePayload.score)} con span directo {effectivePayload.summary.maxForwardSpan} y span inverso {effectivePayload.summary.maxBackwardSpan}.
				</p>

				<div class="mt-8 grid gap-3 sm:grid-cols-2">
					<div class="rounded-3xl border border-white/10 bg-slate-950/30 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Precision</p>
						<p class="mt-2 text-3xl font-black">{formatPercent(effectivePayload.summary.accuracy)}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/30 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Trials</p>
						<p class="mt-2 text-3xl font-black">{effectivePayload.summary.totalTrials}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/30 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Span directo</p>
						<p class="mt-2 text-3xl font-black">{effectivePayload.summary.maxForwardSpan}</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/30 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Span inverso</p>
						<p class="mt-2 text-3xl font-black">{effectivePayload.summary.maxBackwardSpan}</p>
					</div>
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
				<p class="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200">Resumen</p>
				<div class="mt-6 space-y-4">
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Modos completados</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							{effectivePayload.summary.modesCompleted.length > 0
								? effectivePayload.summary.modesCompleted.join(' + ')
								: 'Sin datos'}
						</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Ensayos guardados</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							{effectivePayload.trialLog.length} ensayos registrados entre practica y fase principal.
						</p>
					</div>
					<div class="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
						<h4 class="text-xl font-semibold">Longitud media correcta</h4>
						<p class="mt-2 text-sm leading-7 text-slate-300">
							{typeof effectivePayload.summary.meanLengthCorrect === 'number'
								? `${effectivePayload.summary.meanLengthCorrect} digitos`
								: 'N/D'}
						</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
