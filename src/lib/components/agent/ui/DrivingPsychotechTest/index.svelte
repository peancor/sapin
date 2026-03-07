<script lang="ts">
	import { onDestroy } from 'svelte';
	import GameSurface from './GameSurface.svelte';
	import { submitUIResponse } from '../shared/ui-response';
	import {
		buildBimanualPayload,
		buildReactionBrakingPayload,
		buildReactionBrakingTrialLog,
		buildTimeToContactPayload,
		buildTimeToContactTrialLog,
		getDrivingPsychotechInterpretation,
		getDrivingPsychotechLabel,
		parseInitialDrivingPsychotechPayload,
		resolveDrivingPsychotechConfig,
		type BimanualConfig,
		type BimanualSegmentLog,
		type BimanualSummaryInput,
		type DrivingPsychotechPayload,
		type DrivingPsychotechTestType,
		type ReactionBrakingConfig,
		type ReactionBrakingTrial,
		type ReactionBrakingTrialLog,
		type ReactionResponse,
		type ReactionResponseMode,
		type TimeToContactConfig,
		type TimeToContactTrial,
		type TimeToContactTrialLog
	} from '../shared/driving-psychotech';
	import {
		formatDifficultyLabel,
		formatPercent,
		type ImmersiveState
	} from '../shared/cognitive-tests';

	interface Props {
		instanceId: string;
		title?: string;
		testType?: DrivingPsychotechTestType;
		difficulty?: 'easy' | 'medium' | 'hard';
		instructions?: string;
		practiceDurationSec?: number;
		durationSec?: number;
		practiceTrials?: number;
		mainTrials?: number;
		responseMode?: ReactionResponseMode;
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score: number) => void;
		onPersistedResponse?: (payload: Record<string, unknown>) => void;
		onImmersiveStateChange?: (state: ImmersiveState) => void;
	}

	interface BimanualRuntimeAccumulator {
		totalDurationMs: number;
		onTrackLeftMs: number;
		onTrackRightMs: number;
		simultaneousOffTrackMs: number;
		offTrackEventsLeft: number;
		offTrackEventsRight: number;
		absOffsetIntegralLeft: number;
		absOffsetIntegralRight: number;
		wasOnTrackLeft: boolean;
		wasOnTrackRight: boolean;
	}

	let {
		instanceId,
		title,
		testType,
		difficulty,
		instructions,
		practiceDurationSec,
		durationSec,
		practiceTrials,
		mainTrials,
		responseMode,
		interactive: initialInteractive,
		initialUserResponse,
		apiBase,
		onRespond,
		onPersistedResponse,
		onImmersiveStateChange
	}: Props = $props();

	function createResolvedConfig() {
		return resolveDrivingPsychotechConfig({
			title,
			testType,
			difficulty,
			instructions,
			practiceDurationSec,
			durationSec,
			practiceTrials,
			mainTrials,
			responseMode
		});
	}

	const config = createResolvedConfig();
	const initialPayload = (() => parseInitialDrivingPsychotechPayload(initialUserResponse))();

	let phase = $state<'intro' | 'practice' | 'practice-complete' | 'main' | 'results'>(
		initialPayload ? 'results' : 'intro'
	);
	let interactive = $state((() => initialInteractive && !initialPayload)());
	let submitted = $state(!!initialPayload);
	let isSubmitting = $state(false);
	let submitError = $state('');
	let pendingPayload = $state<DrivingPsychotechPayload | null>(initialPayload);

	let canvas = $state<HTMLCanvasElement | null>(null);
	let rafHandle: number | null = null;
	let lastFrameAtMs = $state(0);
	let currentElapsedMs = $state(0);
	let phaseStartedAtMs = $state(0);
	let trialIndex = $state(0);

	let bimanualSegmentLog = $state<BimanualSegmentLog[]>(
		initialPayload?.testType === 'bimanual_coordination' ? initialPayload.segmentLog : []
	);
	let bimanualMainSummaryInput = $state<BimanualSummaryInput | null>(null);
	let bimanualAccumulator: BimanualRuntimeAccumulator = createEmptyBimanualAccumulator();
	let bimanualLastSampleAtMs = $state(0);
	let bimanualLeftPos = $state(0.25);
	let bimanualRightPos = $state(0.75);
	let bimanualLeftCenter = $state(0.25);
	let bimanualRightCenter = $state(0.75);
	let leftPointerId = $state<number | null>(null);
	let rightPointerId = $state<number | null>(null);
	let leftKeyDirection = $state(0);
	let rightKeyDirection = $state(0);

	let ttcTrialLog = $state<TimeToContactTrialLog[]>(
		initialPayload?.testType === 'time_to_contact' ? initialPayload.trialLog : []
	);
	let currentTimeTrial = $state<TimeToContactTrial | null>(null);
	let currentTimeResponseAtMs = $state<number | null>(null);
	let timeFeedback = $state('');
	let timeAdvanceAtMs = $state<number | null>(null);

	let reactionTrialLog = $state<ReactionBrakingTrialLog[]>(
		initialPayload?.testType === 'multiple_reaction_braking' ? initialPayload.trialLog : []
	);
	let currentReactionTrial = $state<ReactionBrakingTrial | null>(null);
	let currentReactionResponse = $state<ReactionResponse>(null);
	let currentReactionResponseAtMs = $state<number | null>(null);
	let reactionFeedback = $state('');
	let reactionAdvanceAtMs = $state<number | null>(null);
	let phaseTimeout: ReturnType<typeof setTimeout> | null = null;

	const isPlayPhase = $derived(phase === 'practice' || phase === 'main');
	const activeTimeTrials = $derived(
		config.testType === 'time_to_contact'
			? phase === 'practice'
				? config.practiceTrials
				: phase === 'main'
					? config.mainTrials
					: []
			: []
	);
	const activeReactionTrials = $derived(
		config.testType === 'multiple_reaction_braking'
			? phase === 'practice'
				? config.practiceTrials
				: phase === 'main'
					? config.mainTrials
					: []
			: []
	);
	const effectivePayload = $derived(
		initialPayload ??
			(config.testType === 'bimanual_coordination'
				? buildBimanualPayload({
						difficulty: config.difficulty,
						segmentLog: bimanualSegmentLog,
						summaryInput:
							bimanualMainSummaryInput ?? {
								totalDurationMs: 1,
								onTrackLeftMs: 0,
								onTrackRightMs: 0,
								simultaneousOffTrackMs: 0,
								offTrackEventsLeft: 0,
								offTrackEventsRight: 0,
								meanAbsoluteOffsetLeft: 0,
								meanAbsoluteOffsetRight: 0
							}
					})
				: config.testType === 'time_to_contact'
					? buildTimeToContactPayload({
							difficulty: config.difficulty,
							trialLog: ttcTrialLog
						})
					: buildReactionBrakingPayload({
							difficulty: config.difficulty,
							trialLog: reactionTrialLog
						}))
	);
	const resultsInterpretation = $derived(getDrivingPsychotechInterpretation(effectivePayload));
	const bimanualDurationSec = $derived(
		config.testType === 'bimanual_coordination'
			? phase === 'practice'
				? config.practiceDurationSec
				: config.durationSec
			: 0
	);
	const bimanualTimeLeftLabel = $derived(
		config.testType === 'bimanual_coordination'
			? `${Math.max(0, Math.ceil(bimanualDurationSec - currentElapsedMs / 1000))}s`
			: '0s'
	);
	const currentTrialCountLabel = $derived(
		config.testType === 'bimanual_coordination'
			? `${Math.ceil(currentElapsedMs / 1000)}s`
			: config.testType === 'time_to_contact'
				? `${Math.min(trialIndex + (currentTimeTrial ? 1 : 0), activeTimeTrials.length)}/${Math.max(activeTimeTrials.length, 1)}`
				: `${Math.min(trialIndex + (currentReactionTrial ? 1 : 0), activeReactionTrials.length)}/${Math.max(activeReactionTrials.length, 1)}`
	);

	function createEmptyBimanualAccumulator(): BimanualRuntimeAccumulator {
		return {
			totalDurationMs: 0,
			onTrackLeftMs: 0,
			onTrackRightMs: 0,
			simultaneousOffTrackMs: 0,
			offTrackEventsLeft: 0,
			offTrackEventsRight: 0,
			absOffsetIntegralLeft: 0,
			absOffsetIntegralRight: 0,
			wasOnTrackLeft: true,
			wasOnTrackRight: true
		};
	}

	function normalizeAccumulator(accumulator: BimanualRuntimeAccumulator): BimanualSummaryInput {
		const total = Math.max(1, accumulator.totalDurationMs);
		return {
			totalDurationMs: total,
			onTrackLeftMs: accumulator.onTrackLeftMs,
			onTrackRightMs: accumulator.onTrackRightMs,
			simultaneousOffTrackMs: accumulator.simultaneousOffTrackMs,
			offTrackEventsLeft: accumulator.offTrackEventsLeft,
			offTrackEventsRight: accumulator.offTrackEventsRight,
			meanAbsoluteOffsetLeft: accumulator.absOffsetIntegralLeft / total,
			meanAbsoluteOffsetRight: accumulator.absOffsetIntegralRight / total
		};
	}

	function clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	function setImmersiveState() {
		onImmersiveStateChange?.({
			canCloseSafely: phase === 'intro' || phase === 'results' || phase === 'practice-complete',
			closePrompt: 'Si sales ahora se perdera el psicotecnico en curso. ¿Quieres cerrar?'
		});
	}

	function clearPhaseTimeout() {
		if (phaseTimeout !== null) {
			clearTimeout(phaseTimeout);
			phaseTimeout = null;
		}
	}

	function handleCanvasReady(nextCanvas: HTMLCanvasElement | null) {
		canvas = nextCanvas;
		syncCanvasSize();
	}

	function syncCanvasSize() {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(rect.width * dpr));
		const height = Math.max(1, Math.round(rect.height * dpr));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
	}

	function stopLoop() {
		if (rafHandle !== null) cancelAnimationFrame(rafHandle);
		rafHandle = null;
		lastFrameAtMs = 0;
	}

	function startLoop() {
		stopLoop();
		rafHandle = requestAnimationFrame(loopFrame);
	}

	function resetAllState() {
		stopLoop();
		clearPhaseTimeout();
		submitted = !!initialPayload;
		interactive = initialInteractive && !initialPayload;
		submitError = '';
		pendingPayload = initialPayload;
		currentElapsedMs = 0;
		phaseStartedAtMs = 0;
		trialIndex = 0;
		bimanualSegmentLog = initialPayload?.testType === 'bimanual_coordination' ? initialPayload.segmentLog : [];
		bimanualMainSummaryInput = null;
		bimanualAccumulator = createEmptyBimanualAccumulator();
		bimanualLastSampleAtMs = 0;
		bimanualLeftPos = 0.25;
		bimanualRightPos = 0.75;
		bimanualLeftCenter = 0.25;
		bimanualRightCenter = 0.75;
		leftPointerId = null;
		rightPointerId = null;
		leftKeyDirection = 0;
		rightKeyDirection = 0;
		ttcTrialLog = initialPayload?.testType === 'time_to_contact' ? initialPayload.trialLog : [];
		currentTimeTrial = null;
		currentTimeResponseAtMs = null;
		timeFeedback = '';
		timeAdvanceAtMs = null;
		reactionTrialLog =
			initialPayload?.testType === 'multiple_reaction_braking' ? initialPayload.trialLog : [];
		currentReactionTrial = null;
		currentReactionResponse = null;
		currentReactionResponseAtMs = null;
		reactionFeedback = '';
		reactionAdvanceAtMs = null;
	}

	function beginSession() {
		resetAllState();
		if (config.testType === 'bimanual_coordination') {
			startBimanualPhase('practice');
			return;
		}
		if (config.testType === 'time_to_contact') {
			startTimeToContactPhase(config.practiceTrials.length > 0 ? 'practice' : 'main');
			return;
		}
		startReactionPhase(config.practiceTrials.length > 0 ? 'practice' : 'main');
	}

	function startBimanualPhase(nextPhase: 'practice' | 'main') {
		phase = nextPhase;
		trialIndex = 0;
		currentElapsedMs = 0;
		phaseStartedAtMs = performance.now();
		bimanualAccumulator = createEmptyBimanualAccumulator();
		bimanualLastSampleAtMs = 0;
		setImmersiveState();
		startLoop();
	}

	function finalizeBimanualPhase() {
		stopLoop();
		const summaryInput = normalizeAccumulator(bimanualAccumulator);
		if (phase === 'practice') {
			phase = 'practice-complete';
			setImmersiveState();
			return;
		}
		bimanualMainSummaryInput = summaryInput;
		phase = 'results';
		const payload = buildBimanualPayload({
			difficulty: config.difficulty,
			segmentLog: bimanualSegmentLog,
			summaryInput
		});
		pendingPayload = payload;
		void persistPayload(payload);
		setImmersiveState();
	}

	function startTimeToContactPhase(nextPhase: 'practice' | 'main') {
		if (config.testType !== 'time_to_contact') return;
		phase = nextPhase;
		trialIndex = 0;
		startTimeToContactTrial(nextPhase === 'practice' ? config.practiceTrials[0] : config.mainTrials[0]);
		setImmersiveState();
		startLoop();
	}

	function startTimeToContactTrial(trial: TimeToContactTrial | undefined) {
		if (!trial) {
			if (phase === 'practice') {
				stopLoop();
				phase = 'practice-complete';
				setImmersiveState();
				return;
			}
			stopLoop();
			phase = 'results';
			const payload = buildTimeToContactPayload({
				difficulty: config.difficulty,
				trialLog: ttcTrialLog
			});
			pendingPayload = payload;
			void persistPayload(payload);
			setImmersiveState();
			return;
		}
		currentTimeTrial = trial;
		currentReactionTrial = null;
		currentTimeResponseAtMs = null;
		timeAdvanceAtMs = null;
		timeFeedback = '';
		currentElapsedMs = 0;
		phaseStartedAtMs = performance.now();
	}

	function finalizeTimeToContactTrial() {
		if (!currentTimeTrial || config.testType !== 'time_to_contact') return;
		const log = buildTimeToContactTrialLog({
			trial: currentTimeTrial,
			responseAtMs: currentTimeResponseAtMs,
			onTimeThresholdMs: config.onTimeThresholdMs
		});
		timeFeedback =
			log.outcome === 'on_time'
				? 'A tiempo'
				: log.outcome === 'early'
					? 'Antes de tiempo'
					: log.outcome === 'late'
						? 'Tarde'
						: 'Sin respuesta';
		ttcTrialLog = [...ttcTrialLog, log];
		currentTimeTrial = null;
		currentTimeResponseAtMs = null;
		const nextIndex = trialIndex + 1;
		trialIndex = nextIndex;
		const nextTrial =
			phase === 'practice'
				? (config as TimeToContactConfig).practiceTrials[nextIndex]
				: (config as TimeToContactConfig).mainTrials[nextIndex];
		clearPhaseTimeout();
		phaseTimeout = setTimeout(() => {
			phaseTimeout = null;
			startTimeToContactTrial(nextTrial);
		}, 520);
	}

	function registerTimeToContactResponse() {
		if (!interactive || !currentTimeTrial || currentTimeResponseAtMs !== null) return;
		if (currentElapsedMs < currentTimeTrial.visibleDurationMs) return;
		currentTimeResponseAtMs = currentElapsedMs;
		timeAdvanceAtMs = currentElapsedMs + 360;
	}

	function startReactionPhase(nextPhase: 'practice' | 'main') {
		if (config.testType !== 'multiple_reaction_braking') return;
		phase = nextPhase;
		trialIndex = 0;
		startReactionTrial(nextPhase === 'practice' ? config.practiceTrials[0] : config.mainTrials[0]);
		setImmersiveState();
		startLoop();
	}

	function startReactionTrial(trial: ReactionBrakingTrial | undefined) {
		if (!trial) {
			if (phase === 'practice') {
				stopLoop();
				phase = 'practice-complete';
				setImmersiveState();
				return;
			}
			stopLoop();
			phase = 'results';
			const payload = buildReactionBrakingPayload({
				difficulty: config.difficulty,
				trialLog: reactionTrialLog
			});
			pendingPayload = payload;
			void persistPayload(payload);
			setImmersiveState();
			return;
		}
		currentReactionTrial = trial;
		currentTimeTrial = null;
		currentReactionResponse = null;
		currentReactionResponseAtMs = null;
		reactionAdvanceAtMs = null;
		reactionFeedback = '';
		currentElapsedMs = 0;
		phaseStartedAtMs = performance.now();
	}

	function finalizeReactionTrial() {
		if (!currentReactionTrial) return;
		const log = buildReactionBrakingTrialLog({
			trial: currentReactionTrial,
			actualResponse: currentReactionResponse,
			reactionMs:
				currentReactionResponseAtMs !== null
					? Math.max(0, currentReactionResponseAtMs - currentReactionTrial.preStimulusMs)
					: null
		});
		reactionFeedback =
			log.outcome === 'hit'
				? 'Correcto'
				: log.outcome === 'correct_rejection'
					? 'Bien ignorado'
					: log.outcome === 'wrong_side'
						? 'Direccion incorrecta'
						: log.outcome === 'false_alarm'
							? 'Falso positivo'
							: 'Respuesta omitida';
		reactionTrialLog = [...reactionTrialLog, log];
		currentReactionTrial = null;
		currentReactionResponse = null;
		currentReactionResponseAtMs = null;
		const nextIndex = trialIndex + 1;
		trialIndex = nextIndex;
		const nextTrial =
			phase === 'practice'
				? (config as ReactionBrakingConfig).practiceTrials[nextIndex]
				: (config as ReactionBrakingConfig).mainTrials[nextIndex];
		clearPhaseTimeout();
		phaseTimeout = setTimeout(() => {
			phaseTimeout = null;
			startReactionTrial(nextTrial);
		}, 480);
	}

	function registerReactionResponse(response: ReactionResponse) {
		if (!interactive || !currentReactionTrial || currentReactionResponse !== null) return;
		if (currentElapsedMs < currentReactionTrial.preStimulusMs) return;
		currentReactionResponse = response;
		currentReactionResponseAtMs = currentElapsedMs;
		reactionAdvanceAtMs = currentElapsedMs + 320;
	}

	function handleBimanualKeyDown(event: KeyboardEvent) {
		if (config.testType !== 'bimanual_coordination' || !interactive || !isPlayPhase) return;
		const key = event.key.toLowerCase();
		if (key === 'a') leftKeyDirection = -1;
		if (key === 'd') leftKeyDirection = 1;
		if (key === 'j') rightKeyDirection = -1;
		if (key === 'l') rightKeyDirection = 1;
	}

	function handleBimanualKeyUp(event: KeyboardEvent) {
		if (config.testType !== 'bimanual_coordination') return;
		const key = event.key.toLowerCase();
		if ((key === 'a' && leftKeyDirection < 0) || (key === 'd' && leftKeyDirection > 0)) leftKeyDirection = 0;
		if ((key === 'j' && rightKeyDirection < 0) || (key === 'l' && rightKeyDirection > 0)) rightKeyDirection = 0;
	}

	function handleDocumentKeydown(event: KeyboardEvent) {
		handleBimanualKeyDown(event);
		if (!interactive || !isPlayPhase) return;
		if (config.testType === 'time_to_contact' && event.code === 'Space') {
			event.preventDefault();
			registerTimeToContactResponse();
			return;
		}
		if (config.testType === 'multiple_reaction_braking') {
			if (event.code === 'Space') {
				event.preventDefault();
				registerReactionResponse('brake');
				return;
			}
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				registerReactionResponse('left');
				return;
			}
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				registerReactionResponse('right');
			}
		}
	}

	function mapHalfPosition(
		clientX: number,
		rect: DOMRect,
		side: 'left' | 'right'
	): number {
		const halfWidth = rect.width / 2;
		const relative =
			side === 'left'
				? (clientX - rect.left) / halfWidth
				: (clientX - rect.left - halfWidth) / halfWidth;
		return side === 'left'
			? clamp(0.07 + clamp(relative, 0, 1) * 0.36, 0.07, 0.43)
			: clamp(0.57 + clamp(relative, 0, 1) * 0.36, 0.57, 0.93);
	}

	function handleTrackPointerDown(event: PointerEvent & { currentTarget: EventTarget & HTMLDivElement }) {
		if (config.testType !== 'bimanual_coordination' || !interactive || !isPlayPhase) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const side = event.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
		const nextPosition = mapHalfPosition(event.clientX, rect, side);
		if (side === 'left') {
			leftPointerId = event.pointerId;
			bimanualLeftPos = nextPosition;
		} else {
			rightPointerId = event.pointerId;
			bimanualRightPos = nextPosition;
		}
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handleTrackPointerMove(event: PointerEvent & { currentTarget: EventTarget & HTMLDivElement }) {
		if (config.testType !== 'bimanual_coordination' || !interactive || !isPlayPhase) return;
		const rect = event.currentTarget.getBoundingClientRect();
		if (event.pointerId === leftPointerId) {
			bimanualLeftPos = mapHalfPosition(event.clientX, rect, 'left');
		}
		if (event.pointerId === rightPointerId) {
			bimanualRightPos = mapHalfPosition(event.clientX, rect, 'right');
		}
	}

	function handleTrackPointerUp(event: PointerEvent & { currentTarget: EventTarget & HTMLDivElement }) {
		if (event.pointerId === leftPointerId) leftPointerId = null;
		if (event.pointerId === rightPointerId) rightPointerId = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}

	function getTrackCenters(yNorm: number, elapsedMs: number) {
		const nextConfig = config as BimanualConfig;
		const left =
			0.25 +
			Math.sin(elapsedMs * 0.00105 + yNorm * 6.8) * nextConfig.curveAmplitudeLeft +
			Math.cos(elapsedMs * 0.00053 + yNorm * 11.2) * nextConfig.curveAmplitudeLeft * 0.45;
		const right =
			0.75 +
			Math.sin(elapsedMs * 0.00081 + yNorm * 7.3 + 1.1) * nextConfig.curveAmplitudeRight +
			Math.cos(elapsedMs * 0.00049 + yNorm * 10.1 + 0.7) *
				nextConfig.curveAmplitudeRight *
				0.42;
		return {
			left: clamp(left, 0.1, 0.4),
			right: clamp(right, 0.6, 0.9)
		};
	}

	function updateBimanual(elapsedMs: number, dtMs: number) {
		if (config.testType !== 'bimanual_coordination') return;
		const nextConfig = config as BimanualConfig;
		currentElapsedMs = elapsedMs;
		const dtSec = dtMs / 1000;
		const { left, right } = getTrackCenters(0.78, elapsedMs);
		bimanualLeftCenter = left;
		bimanualRightCenter = right;
		if (leftPointerId === null) {
			bimanualLeftPos = clamp(
				bimanualLeftPos + leftKeyDirection * nextConfig.inputSpeed * dtSec,
				0.07,
				0.43
			);
		}
		if (rightPointerId === null) {
			bimanualRightPos = clamp(
				bimanualRightPos + rightKeyDirection * nextConfig.inputSpeed * dtSec,
				0.57,
				0.93
			);
		}

		const leftOffset = bimanualLeftPos - bimanualLeftCenter;
		const rightOffset = bimanualRightPos - bimanualRightCenter;
		const leftOnTrack = Math.abs(leftOffset) <= nextConfig.trackHalfWidth;
		const rightOnTrack = Math.abs(rightOffset) <= nextConfig.trackHalfWidth;

		bimanualAccumulator.totalDurationMs += dtMs;
		if (leftOnTrack) bimanualAccumulator.onTrackLeftMs += dtMs;
		if (rightOnTrack) bimanualAccumulator.onTrackRightMs += dtMs;
		if (!leftOnTrack && !rightOnTrack) bimanualAccumulator.simultaneousOffTrackMs += dtMs;
		if (bimanualAccumulator.wasOnTrackLeft && !leftOnTrack) bimanualAccumulator.offTrackEventsLeft += 1;
		if (bimanualAccumulator.wasOnTrackRight && !rightOnTrack) bimanualAccumulator.offTrackEventsRight += 1;
		bimanualAccumulator.absOffsetIntegralLeft += Math.abs(leftOffset) * dtMs;
		bimanualAccumulator.absOffsetIntegralRight += Math.abs(rightOffset) * dtMs;
		bimanualAccumulator.wasOnTrackLeft = leftOnTrack;
		bimanualAccumulator.wasOnTrackRight = rightOnTrack;

		const newSegments: BimanualSegmentLog[] = [];
		while (elapsedMs - bimanualLastSampleAtMs >= nextConfig.sampleMs) {
			bimanualLastSampleAtMs += nextConfig.sampleMs;
			newSegments.push({
				phase: phase === 'practice' ? 'practice' : 'main',
				tMs: Math.round(bimanualLastSampleAtMs),
				leftOffsetNorm: Number(leftOffset.toFixed(3)),
				rightOffsetNorm: Number(rightOffset.toFixed(3)),
				leftOnTrack,
				rightOnTrack,
				leftCenterNorm: Number(bimanualLeftCenter.toFixed(3)),
				rightCenterNorm: Number(bimanualRightCenter.toFixed(3))
			});
		}
		if (newSegments.length > 0) {
			bimanualSegmentLog = [...bimanualSegmentLog, ...newSegments];
		}

		const durationLimitMs =
			(phase === 'practice' ? nextConfig.practiceDurationSec : nextConfig.durationSec) * 1000;
		if (elapsedMs >= durationLimitMs) {
			finalizeBimanualPhase();
		}
	}

	function updateTimeToContact(elapsedMs: number) {
		currentElapsedMs = elapsedMs;
		if (!currentTimeTrial) return;
		const trialEndMs =
			currentTimeTrial.visibleDurationMs +
			currentTimeTrial.occlusionMs +
			currentTimeTrial.postExitWindowMs;
		if (timeAdvanceAtMs !== null && elapsedMs >= timeAdvanceAtMs) {
			finalizeTimeToContactTrial();
			return;
		}
		if (elapsedMs >= trialEndMs) {
			finalizeTimeToContactTrial();
		}
	}

	function updateReaction(elapsedMs: number) {
		currentElapsedMs = elapsedMs;
		if (!currentReactionTrial) return;
		const trialEndMs = currentReactionTrial.preStimulusMs + currentReactionTrial.responseWindowMs;
		if (reactionAdvanceAtMs !== null && elapsedMs >= reactionAdvanceAtMs) {
			finalizeReactionTrial();
			return;
		}
		if (elapsedMs >= trialEndMs) {
			finalizeReactionTrial();
		}
	}

	function lerp(start: number, end: number, progress: number): number {
		return start + (end - start) * progress;
	}

	function loopFrame(now: number) {
		syncCanvasSize();
		if (phaseStartedAtMs === 0) phaseStartedAtMs = now;
		if (lastFrameAtMs === 0) lastFrameAtMs = now;
		const dtMs = Math.min(50, Math.max(0, now - lastFrameAtMs));
		lastFrameAtMs = now;
		const elapsedMs = Math.max(0, now - phaseStartedAtMs);

		if (config.testType === 'bimanual_coordination') {
			updateBimanual(elapsedMs, dtMs);
		} else if (config.testType === 'time_to_contact') {
			updateTimeToContact(elapsedMs);
		} else {
			updateReaction(elapsedMs);
		}

		drawCanvas();
		if (phase === 'practice' || phase === 'main') {
			rafHandle = requestAnimationFrame(loopFrame);
		} else {
			rafHandle = null;
		}
	}

	function drawCanvas() {
		if (!canvas) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		const width = canvas.width;
		const height = canvas.height;
		context.clearRect(0, 0, width, height);
		if (config.testType === 'bimanual_coordination') {
			drawBimanualScene(context, width, height);
			return;
		}
		if (config.testType === 'time_to_contact') {
			drawTimeToContactScene(context, width, height);
			return;
		}
		drawReactionScene(context, width, height);
	}

	function drawBimanualScene(
		context: CanvasRenderingContext2D,
		width: number,
		height: number
	) {
		const nextConfig = config as BimanualConfig;
		const gradient = context.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, '#0f172a');
		gradient.addColorStop(0.55, '#11283f');
		gradient.addColorStop(1, '#08111f');
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);

		context.fillStyle = 'rgba(14, 165, 233, 0.08)';
		context.fillRect(width * 0.5 - 1, 0, 2, height);

		const sampleCount = 28;
		const laneHalfWidthPx = nextConfig.trackHalfWidth * width;
		const drawLane = (side: 'left' | 'right', laneColor: string, borderColor: string) => {
			const centers = Array.from({ length: sampleCount }, (_, index) => {
				const yNorm = index / (sampleCount - 1);
				return getTrackCenters(yNorm, currentElapsedMs * nextConfig.scrollSpeed)[side];
			});
			context.beginPath();
			centers.forEach((center, index) => {
				const x = center * width - laneHalfWidthPx;
				const y = (index / (sampleCount - 1)) * height;
				if (index === 0) context.moveTo(x, y);
				else context.lineTo(x, y);
			});
			for (let index = sampleCount - 1; index >= 0; index -= 1) {
				const center = centers[index];
				const x = center * width + laneHalfWidthPx;
				const y = (index / (sampleCount - 1)) * height;
				context.lineTo(x, y);
			}
			context.closePath();
			context.fillStyle = laneColor;
			context.fill();
			context.lineWidth = 3;
			context.strokeStyle = borderColor;
			context.stroke();

			context.setLineDash([14, 12]);
			context.beginPath();
			centers.forEach((center, index) => {
				const x = center * width;
				const y = (index / (sampleCount - 1)) * height;
				if (index === 0) context.moveTo(x, y);
				else context.lineTo(x, y);
			});
			context.strokeStyle = 'rgba(226, 232, 240, 0.65)';
			context.lineWidth = 2;
			context.stroke();
			context.setLineDash([]);
		};

		drawLane('left', 'rgba(36, 94, 146, 0.55)', 'rgba(125, 211, 252, 0.65)');
		drawLane('right', 'rgba(21, 128, 61, 0.45)', 'rgba(110, 231, 183, 0.65)');

		const vehicleY = height * 0.8;
		context.fillStyle = 'rgba(248, 250, 252, 0.95)';
		context.beginPath();
		context.arc(bimanualLeftPos * width, vehicleY, height * 0.03, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = 'rgba(34, 197, 94, 0.95)';
		context.beginPath();
		context.arc(bimanualRightPos * width, vehicleY, height * 0.03, 0, Math.PI * 2);
		context.fill();

		context.fillStyle = 'rgba(255, 255, 255, 0.88)';
		context.font = `600 ${Math.max(18, width * 0.024)}px system-ui`;
		context.fillText('Canal izquierdo', width * 0.09, height * 0.1);
		context.fillText('Canal derecho', width * 0.61, height * 0.1);

		const dualOffTrack =
			Math.abs(bimanualLeftPos - bimanualLeftCenter) > nextConfig.trackHalfWidth &&
			Math.abs(bimanualRightPos - bimanualRightCenter) > nextConfig.trackHalfWidth;
		if (dualOffTrack) {
			context.fillStyle = 'rgba(248, 113, 113, 0.16)';
			context.fillRect(0, 0, width, height);
			context.fillStyle = '#fecaca';
			context.font = `700 ${Math.max(22, width * 0.03)}px system-ui`;
			context.fillText('Ambos canales fuera de pista', width * 0.24, height * 0.16);
		}
	}

	function drawTimeToContactScene(
		context: CanvasRenderingContext2D,
		width: number,
		height: number
	) {
		const gradient = context.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, '#1e293b');
		gradient.addColorStop(0.58, '#254156');
		gradient.addColorStop(1, '#0f172a');
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);

		context.fillStyle = 'rgba(148, 163, 184, 0.15)';
		context.fillRect(0, height * 0.62, width, height * 0.38);
		context.strokeStyle = 'rgba(226, 232, 240, 0.55)';
		context.lineWidth = 3;
		context.beginPath();
		context.moveTo(width * 0.08, height * 0.62);
		context.lineTo(width * 0.92, height * 0.62);
		context.stroke();

		const tunnelStart = width * 0.38;
		const tunnelEnd = width * 0.62;
		context.fillStyle = '#111827';
		context.fillRect(tunnelStart, height * 0.34, tunnelEnd - tunnelStart, height * 0.34);
		context.fillStyle = '#334155';
		context.fillRect(tunnelStart - width * 0.015, height * 0.3, width * 0.03, height * 0.42);
		context.fillRect(tunnelEnd - width * 0.015, height * 0.3, width * 0.03, height * 0.42);

		if (currentTimeTrial?.distractors) {
			for (let index = 0; index < 6; index += 1) {
				const wave = ((currentElapsedMs * 0.0004 + index * 0.17) % 1) * width;
				context.fillStyle = 'rgba(125, 211, 252, 0.16)';
				context.beginPath();
				context.arc(wave, height * (0.18 + (index % 3) * 0.12), width * 0.012, 0, Math.PI * 2);
				context.fill();
			}
		}

		if (currentTimeTrial) {
			const predictedExitAtMs =
				currentTimeTrial.visibleDurationMs + currentTimeTrial.occlusionMs;
			const startX = width * 0.12;
			const endX = width * 0.86;
			let x = startX;
			let visible = true;
			if (currentElapsedMs < currentTimeTrial.visibleDurationMs) {
				x = lerp(startX, tunnelStart, currentElapsedMs / currentTimeTrial.visibleDurationMs);
			} else if (currentElapsedMs < predictedExitAtMs) {
				x = tunnelStart;
				visible = false;
			} else {
				const visibleProgress = clamp(
					(currentElapsedMs - predictedExitAtMs) / currentTimeTrial.postExitWindowMs,
					0,
					1
				);
				x = lerp(tunnelEnd, endX, visibleProgress);
			}

			if (visible) {
				context.fillStyle = '#f8fafc';
				context.fillRect(x - width * 0.022, height * 0.54, width * 0.048, height * 0.045);
				context.fillStyle = '#0ea5e9';
				context.fillRect(x - width * 0.026, height * 0.565, width * 0.056, height * 0.022);
			}
		}

		context.fillStyle = 'rgba(255, 255, 255, 0.88)';
		context.font = `600 ${Math.max(22, width * 0.03)}px system-ui`;
		context.fillText('Marca el instante exacto de salida', width * 0.12, height * 0.16);

		if (timeFeedback) {
			context.fillStyle = 'rgba(15, 23, 42, 0.72)';
			context.fillRect(width * 0.34, height * 0.22, width * 0.32, height * 0.1);
			context.fillStyle = '#f8fafc';
			context.font = `700 ${Math.max(24, width * 0.03)}px system-ui`;
			context.fillText(timeFeedback, width * 0.41, height * 0.29);
		}
	}

	function drawReactionScene(
		context: CanvasRenderingContext2D,
		width: number,
		height: number
	) {
		const gradient = context.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, '#0f172a');
		gradient.addColorStop(0.4, '#1f3750');
		gradient.addColorStop(1, '#111827');
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);

		context.fillStyle = '#1e293b';
		context.beginPath();
		context.moveTo(width * 0.2, height);
		context.lineTo(width * 0.4, height * 0.35);
		context.lineTo(width * 0.6, height * 0.35);
		context.lineTo(width * 0.8, height);
		context.closePath();
		context.fill();
		context.strokeStyle = 'rgba(226, 232, 240, 0.5)';
		context.lineWidth = 3;
		context.beginPath();
		context.moveTo(width * 0.5, height);
		context.lineTo(width * 0.5, height * 0.35);
		context.stroke();

		context.fillStyle = 'rgba(255, 255, 255, 0.88)';
		context.font = `600 ${Math.max(22, width * 0.028)}px system-ui`;
		context.fillText('Escena de cruce y frenado', width * 0.1, height * 0.14);

		if (currentReactionTrial) {
			const stimulusVisible = currentElapsedMs >= currentReactionTrial.preStimulusMs;
			if (stimulusVisible) {
				const laneX =
					currentReactionTrial.stimulusSide === 'left'
						? width * 0.42
						: currentReactionTrial.stimulusSide === 'right'
							? width * 0.58
							: width * 0.5;
				const hazard = currentReactionTrial.stimulusKind === 'hazard';
				context.fillStyle = hazard ? '#fb7185' : '#38bdf8';
				context.beginPath();
				context.arc(laneX, height * 0.62, width * 0.045, 0, Math.PI * 2);
				context.fill();
				context.fillStyle = '#f8fafc';
				context.font = `700 ${Math.max(18, width * 0.024)}px system-ui`;
				context.fillText(
					hazard ? 'Peligro' : 'Distractor',
					laneX - width * 0.045,
					height * 0.74
				);
			}
		}

		if (reactionFeedback) {
			context.fillStyle = 'rgba(15, 23, 42, 0.72)';
			context.fillRect(width * 0.32, height * 0.22, width * 0.36, height * 0.1);
			context.fillStyle = '#f8fafc';
			context.font = `700 ${Math.max(22, width * 0.028)}px system-ui`;
			context.fillText(reactionFeedback, width * 0.39, height * 0.29);
		}
	}

	async function persistPayload(payload: DrivingPsychotechPayload) {
		if (submitted || isSubmitting) return;
		isSubmitting = true;
		submitError = '';
		const result = await submitUIResponse({
			apiBase,
			instanceId,
			componentKey: 'DrivingPsychotechTest',
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

	function getHudItems() {
		const phaseLabel =
			phase === 'practice'
				? 'Practica'
				: phase === 'main'
					? 'Principal'
					: phase === 'practice-complete'
						? 'Listo'
						: 'Resultados';
		if (config.testType === 'bimanual_coordination') {
			return [
				{ label: 'Fase', value: phaseLabel },
				{ label: 'Tiempo', value: bimanualTimeLeftLabel },
				{ label: 'Dificultad', value: formatDifficultyLabel(config.difficulty) },
				{
					label: 'Pista',
					value: `${Math.round(Math.max(0, 100 - Math.abs(bimanualLeftPos - bimanualLeftCenter) * 280))}%`
				}
			];
		}
		if (config.testType === 'time_to_contact') {
			return [
				{ label: 'Fase', value: phaseLabel },
				{ label: 'Ensayo', value: currentTrialCountLabel },
				{ label: 'Dificultad', value: formatDifficultyLabel(config.difficulty) },
				{ label: 'Input', value: 'Tap o espacio' }
			];
		}
		return [
			{ label: 'Fase', value: phaseLabel },
			{ label: 'Ensayo', value: currentTrialCountLabel },
			{ label: 'Modo', value: (config as ReactionBrakingConfig).responseMode === 'selective' ? 'Selectivo' : 'Freno' },
			{ label: 'Dificultad', value: formatDifficultyLabel(config.difficulty) }
		];
	}

	function startMainPhase() {
		clearPhaseTimeout();
		submitError = '';
		if (config.testType === 'bimanual_coordination') {
			startBimanualPhase('main');
			return;
		}
		if (config.testType === 'time_to_contact') {
			startTimeToContactPhase('main');
			return;
		}
		startReactionPhase('main');
	}

	$effect(() => {
		setImmersiveState();
	});

	$effect(() => {
		if (!canvas) return;
		syncCanvasSize();
		const handleResize = () => syncCanvasSize();
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	$effect(() => {
		drawCanvas();
	});

	onDestroy(() => {
		stopLoop();
		clearPhaseTimeout();
	});
</script>

<svelte:document onkeydown={handleDocumentKeydown} onkeyup={handleBimanualKeyUp} />

{#if phase === 'intro'}
	<div class="flex min-h-[78vh] flex-col justify-between gap-8">
		<div class="space-y-6">
			<div class="inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
				Psicotecnico de conduccion
			</div>
			<div class="space-y-3">
				<h1 class="max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
					{title ?? config.title}
				</h1>
				<p class="max-w-3xl text-base text-slate-200 sm:text-lg">{config.instructions}</p>
			</div>
			<div class="grid gap-4 lg:grid-cols-3">
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Dificultad</p>
					<p class="mt-2 text-3xl font-black text-white">
						{formatDifficultyLabel(config.difficulty)}
					</p>
					<p class="mt-2 text-sm text-slate-300">La fase principal se guarda al terminar.</p>
				</div>
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Controles</p>
					<p class="mt-2 text-lg font-bold text-white">
						{#if config.testType === 'bimanual_coordination'}
							2 dedos o A/D + J/L
						{:else if config.testType === 'time_to_contact'}
							Tap o barra espaciadora
						{:else if (config as ReactionBrakingConfig).responseMode === 'selective'}
							Izquierda / derecha
						{:else}
							Freno con espacio o boton
						{/if}
					</p>
					<p class="mt-2 text-sm text-slate-300">
						La sesion empieza dentro del overlay cuando pulses Empezar.
					</p>
				</div>
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Formato</p>
					<p class="mt-2 text-lg font-bold text-white">
						{config.testType === 'bimanual_coordination'
							? `${config.practiceDurationSec}s de practica + ${config.durationSec}s principal`
							: config.testType === 'time_to_contact'
								? `${config.practiceTrials.length} practica + ${config.mainTrials.length} principal`
								: `${config.practiceTrials.length} practica + ${config.mainTrials.length} principal`}
					</p>
					<p class="mt-2 text-sm text-slate-300">No se persiste progreso parcial si abandonas.</p>
				</div>
			</div>
		</div>

		<div class="flex flex-wrap gap-3">
			{#if interactive}
				<button
					type="button"
					class="rounded-3xl bg-cyan-400 px-6 py-3 text-base font-black text-slate-950 transition hover:bg-cyan-300"
					onclick={beginSession}
				>
					Empezar
				</button>
			{/if}
		</div>
	</div>
{:else if phase === 'practice-complete'}
	<div class="flex min-h-[76vh] flex-col justify-center gap-8">
		<div class="max-w-3xl space-y-4">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Practica completada</p>
			<h2 class="text-4xl font-black text-white sm:text-5xl">Ahora empieza la parte principal</h2>
			<p class="text-base text-slate-200 sm:text-lg">
				La practica no se puntua. La siguiente fase registra las metricas finales y se guardara
				al terminar.
			</p>
		</div>
		<div class="flex flex-wrap gap-3">
			<button
				type="button"
				class="rounded-3xl bg-cyan-400 px-6 py-3 text-base font-black text-slate-950 transition hover:bg-cyan-300"
				onclick={startMainPhase}
			>
				Empezar prueba principal
			</button>
			<button
				type="button"
				class="rounded-3xl border border-white/15 bg-white/6 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
				onclick={beginSession}
			>
				Repetir practica
			</button>
		</div>
	</div>
{:else if phase === 'practice' || phase === 'main'}
	<GameSurface
		hudItems={getHudItems()}
		portraitPreferred={config.testType === 'bimanual_coordination'}
		onCanvasReady={handleCanvasReady}
	>
		{#if config.testType === 'bimanual_coordination'}
			<div
				class="absolute inset-0"
				onpointerdown={handleTrackPointerDown}
				onpointermove={handleTrackPointerMove}
				onpointerup={handleTrackPointerUp}
				onpointercancel={handleTrackPointerUp}
			>
				<div class="absolute bottom-6 left-6 rounded-3xl bg-slate-950/55 px-4 py-3 text-sm text-slate-100">
					<p class="font-semibold">Canal izquierdo</p>
					<p class="text-slate-300">A / D o dedo izquierdo</p>
				</div>
				<div class="absolute bottom-6 right-6 rounded-3xl bg-slate-950/55 px-4 py-3 text-right text-sm text-slate-100">
					<p class="font-semibold">Canal derecho</p>
					<p class="text-slate-300">J / L o dedo derecho</p>
				</div>
			</div>
		{/if}

		{#snippet controls()}
			{#if config.testType === 'time_to_contact'}
				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						class="min-w-[200px] rounded-3xl bg-cyan-400 px-6 py-4 text-lg font-black text-slate-950 transition hover:bg-cyan-300"
						onclick={registerTimeToContactResponse}
						disabled={!interactive}
					>
						Marcar salida
					</button>
					<div class="rounded-3xl border border-white/10 bg-white/6 px-5 py-4 text-sm text-slate-200">
						Pulsa cuando creas que el objeto saldria del tunel.
					</div>
				</div>
			{:else if config.testType === 'multiple_reaction_braking'}
				<div class="flex flex-wrap gap-3">
					{#if (config as ReactionBrakingConfig).responseMode === 'selective'}
						<button
							type="button"
							class="min-w-[180px] rounded-3xl bg-sky-400 px-6 py-4 text-lg font-black text-slate-950 transition hover:bg-sky-300"
							onclick={() => registerReactionResponse('left')}
							disabled={!interactive}
						>
							Izquierda
						</button>
						<button
							type="button"
							class="min-w-[180px] rounded-3xl bg-emerald-400 px-6 py-4 text-lg font-black text-slate-950 transition hover:bg-emerald-300"
							onclick={() => registerReactionResponse('right')}
							disabled={!interactive}
						>
							Derecha
						</button>
					{:else}
						<button
							type="button"
							class="min-w-[220px] rounded-3xl bg-rose-400 px-6 py-4 text-lg font-black text-slate-950 transition hover:bg-rose-300"
							onclick={() => registerReactionResponse('brake')}
							disabled={!interactive}
						>
							Frenar
						</button>
					{/if}
					<div class="rounded-3xl border border-white/10 bg-white/6 px-5 py-4 text-sm text-slate-200">
						{#if (config as ReactionBrakingConfig).responseMode === 'selective'}
							Flechas izquierda/derecha en desktop. Ignora los distractores.
						{:else}
							Usa espacio o el boton de freno. Ignora los distractores.
						{/if}
					</div>
				</div>
			{/if}
		{/snippet}

		{#snippet footer()}
			<div class="rounded-3xl border border-white/10 bg-white/6 px-5 py-4 text-sm text-slate-200">
				{#if config.testType === 'bimanual_coordination'}
					Mantén ambos cursores centrados. Las salidas simultaneas penalizan mas que una desviacion aislada.
				{:else if config.testType === 'time_to_contact'}
					Ensayos consecutivos pueden tener distinta longitud de oclusion. Cuenta mentalmente el ritmo.
				{:else}
					Responde solo ante peligro real. En dificil debes discriminar la direccion correcta.
				{/if}
			</div>
		{/snippet}
	</GameSurface>
{:else}
	<div class="space-y-6">
		<div class="space-y-3">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Resultados</p>
			<h2 class="text-4xl font-black text-white sm:text-5xl">
				{title ?? getDrivingPsychotechLabel(effectivePayload.testType)}
			</h2>
			<p class="max-w-3xl text-base text-slate-200 sm:text-lg">{resultsInterpretation}</p>
		</div>

		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
			<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Score</p>
				<p class="mt-2 text-4xl font-black text-white">{formatPercent(effectivePayload.score)}</p>
			</div>

			{#if effectivePayload.testType === 'bimanual_coordination'}
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Tiempo en pista</p>
					<p class="mt-2 text-2xl font-black text-white">
						{effectivePayload.summary.percentOnTrackLeft}% / {effectivePayload.summary.percentOnTrackRight}%
					</p>
				</div>
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Salidas</p>
					<p class="mt-2 text-2xl font-black text-white">
						{effectivePayload.summary.offTrackEventsLeft + effectivePayload.summary.offTrackEventsRight}
					</p>
				</div>
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Fuera en ambos</p>
					<p class="mt-2 text-2xl font-black text-white">
						{Math.round(effectivePayload.summary.simultaneousOffTrackMs / 100) / 10}s
					</p>
				</div>
			{:else if effectivePayload.testType === 'time_to_contact'}
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Error medio</p>
					<p class="mt-2 text-2xl font-black text-white">
						{typeof effectivePayload.summary.meanAbsoluteErrorMs === 'number'
							? `${effectivePayload.summary.meanAbsoluteErrorMs} ms`
							: 'N/D'}
					</p>
				</div>
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">A tiempo</p>
					<p class="mt-2 text-2xl font-black text-white">{effectivePayload.summary.onTimeCount}</p>
				</div>
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Antes / tarde</p>
					<p class="mt-2 text-2xl font-black text-white">
						{effectivePayload.summary.earlyCount} / {effectivePayload.summary.lateCount}
					</p>
				</div>
			{:else}
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Hits</p>
					<p class="mt-2 text-2xl font-black text-white">{effectivePayload.summary.hits}</p>
				</div>
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Falsos positivos</p>
					<p class="mt-2 text-2xl font-black text-white">{effectivePayload.summary.falseAlarms}</p>
				</div>
				<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">RT media</p>
					<p class="mt-2 text-2xl font-black text-white">
						{typeof effectivePayload.summary.meanReactionMs === 'number'
							? `${effectivePayload.summary.meanReactionMs} ms`
							: 'N/D'}
					</p>
				</div>
			{/if}
		</div>

		<div class="rounded-[2rem] border border-white/10 bg-white/6 p-5">
			<p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Lectura orientativa</p>
			<p class="mt-3 text-sm leading-7 text-slate-200">
				{resultsInterpretation} Esta lectura es interna a la app y no equivale a una evaluacion oficial.
			</p>
			<p class="mt-4 text-xs uppercase tracking-[0.18em] text-slate-400">
				{submitted ? 'Resultado guardado' : 'Pendiente de guardado'} · {formatDifficultyLabel(effectivePayload.difficulty)}
			</p>
			{#if submitError}
				<p class="mt-4 text-sm text-rose-200">{submitError}</p>
				{#if interactive}
					<button
						type="button"
						class="mt-4 rounded-3xl bg-rose-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-rose-300"
						onclick={retrySubmit}
						disabled={isSubmitting}
					>
						{isSubmitting ? 'Reintentando...' : 'Reintentar envio'}
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}
