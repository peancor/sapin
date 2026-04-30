<script module lang="ts">
	import type { LessonYoutubeBlock, LessonYoutubePausePoint } from '$lib/types/lesson';

	type YoutubeProgressEvent = 'started' | 'pause_point_acknowledged' | 'completed';
	type YoutubeProgressPayload = {
		eventType: YoutubeProgressEvent;
		currentTime?: number;
		pausePointId?: string;
		duration?: number;
	};

	type YoutubePlayer = {
		playVideo: () => void;
		pauseVideo: () => void;
		destroy: () => void;
		getCurrentTime: () => number;
		getDuration: () => number;
		getPlayerState: () => number;
	};

	type YoutubePlayerConstructor = new (
		element: HTMLElement,
		options: {
			videoId: string;
			playerVars: Record<string, string | number>;
			events: {
				onReady: () => void;
				onStateChange: (event: { data: number }) => void;
			};
		}
	) => YoutubePlayer;

	declare global {
		interface Window {
			YT?: {
				Player: YoutubePlayerConstructor;
				PlayerState?: {
					ENDED: number;
					PLAYING: number;
				};
			};
			onYouTubeIframeAPIReady?: () => void;
		}
	}

	let iframeApiPromise: Promise<void> | null = null;

	function loadYouTubeIframeApi(): Promise<void> {
		if (typeof window === 'undefined') return Promise.resolve();
		if (window.YT?.Player) return Promise.resolve();
		if (iframeApiPromise) return iframeApiPromise;

		iframeApiPromise = new Promise((resolve) => {
			const previousCallback = window.onYouTubeIframeAPIReady;
			window.onYouTubeIframeAPIReady = () => {
				previousCallback?.();
				resolve();
			};

			if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
				const script = document.createElement('script');
				script.src = 'https://www.youtube.com/iframe_api';
				script.async = true;
				document.head.appendChild(script);
			}
		});

		return iframeApiPromise;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { getYoutubeSegmentProgress } from '$lib/lesson/youtubeProgress';

	interface Props {
		block: LessonYoutubeBlock;
		outputs?: Record<string, unknown>;
		isReadOnly?: boolean;
		onProgress?: (payload: YoutubeProgressPayload) => void | Promise<void>;
	}

	let { block, outputs = {}, isReadOnly = false, onProgress }: Props = $props();

	let mountElement: HTMLDivElement | null = $state(null);
	let player: YoutubePlayer | null = null;
	let ready = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let started = $state(false);
	let completed = $state(false);
	let activePausePoint: LessonYoutubePausePoint | null = $state(null);
	let reachedPausePointIds = $state<string[]>([]);
	let initializedBlockId = $state<string | null>(null);

	const segmentStart = $derived(block.startSeconds ?? 0);
	const segmentEnd = $derived(block.endSeconds ?? null);
	const progress = $derived(
		getYoutubeSegmentProgress({
			currentTime,
			startSeconds: segmentStart,
			endSeconds: segmentEnd,
			duration,
			alreadyCompleted: completed
		})
	);
	const watchPercent = $derived(progress.watchPercent);

	$effect(() => {
		if (initializedBlockId === block.id) return;
		initializedBlockId = block.id;
		currentTime =
			typeof outputs.lastKnownTime === 'number' ? outputs.lastKnownTime : (block.startSeconds ?? 0);
		started = outputs.started === true;
		completed = outputs.completed === true;
		activePausePoint = null;
		reachedPausePointIds = Array.isArray(outputs.reachedPausePointIds)
			? outputs.reachedPausePointIds.filter((value): value is string => typeof value === 'string')
			: [];
	});

	onMount(() => {
		let disposed = false;
		let pollHandle: ReturnType<typeof setInterval> | null = null;

		async function initialize() {
			await loadYouTubeIframeApi();
			if (disposed || !mountElement || !window.YT?.Player) return;

			player = new window.YT.Player(mountElement, {
				videoId: block.videoId,
				playerVars: {
					enablejsapi: 1,
					origin: window.location.origin,
					controls: 0,
					disablekb: 1,
					playsinline: 1,
					rel: 0,
					modestbranding: 1,
					...(block.startSeconds !== null && block.startSeconds !== undefined
						? { start: Math.floor(block.startSeconds) }
						: {}),
					...(block.endSeconds !== null && block.endSeconds !== undefined
						? { end: Math.floor(block.endSeconds) }
						: {})
				},
				events: {
					onReady: () => {
						ready = true;
						duration = safePlayerNumber(() => player?.getDuration()) ?? 0;
					},
					onStateChange: (event) => {
						if (event.data === 0) {
							void markCompleted();
						}
					}
				}
			});

			pollHandle = setInterval(pollPlayer, 500);
		}

		void initialize();

		return () => {
			disposed = true;
			if (pollHandle) clearInterval(pollHandle);
			player?.destroy();
			player = null;
		};
	});

	function safePlayerNumber(read: () => number | undefined): number | null {
		try {
			const value = read();
			return typeof value === 'number' && Number.isFinite(value) ? value : null;
		} catch {
			return null;
		}
	}

	function isPlaying(): boolean {
		const state = safePlayerNumber(() => player?.getPlayerState());
		return state === 1;
	}

	function pollPlayer() {
		if (!player || !ready) return;

		const nextTime = safePlayerNumber(() => player?.getCurrentTime());
		if (nextTime !== null) currentTime = nextTime;

		const nextDuration = safePlayerNumber(() => player?.getDuration());
		if (nextDuration !== null && nextDuration > 0) duration = nextDuration;

		if (isPlaying() && !started && !isReadOnly) {
			started = true;
			void emitProgress({ eventType: 'started' });
		}

		if (completed || activePausePoint) return;

		if (progress.completeEnough) {
			void markCompleted();
			return;
		}

		const pausePoint = (block.pausePoints ?? [])
			.filter((candidate) => !reachedPausePointIds.includes(candidate.id))
			.sort((left, right) => left.seconds - right.seconds)
			.find((candidate) => currentTime >= candidate.seconds);

		if (pausePoint && isPlaying()) {
			player.pauseVideo();
			activePausePoint = pausePoint;
		}
	}

	async function emitProgress(payload: YoutubeProgressPayload) {
		if (isReadOnly) return;
		await onProgress?.({
			...payload,
			currentTime,
			duration
		});
	}

	async function acknowledgePausePoint() {
		if (!activePausePoint) return;
		const pausePointId = activePausePoint.id;
		if (!reachedPausePointIds.includes(pausePointId)) {
			reachedPausePointIds = [...reachedPausePointIds, pausePointId];
		}

		await emitProgress({
			eventType: 'pause_point_acknowledged',
			pausePointId
		});
		activePausePoint = null;
		player?.playVideo();
	}

	async function markCompleted() {
		if (completed) return;
		completed = true;
		if (player) {
			currentTime = safePlayerNumber(() => player?.getCurrentTime()) ?? currentTime;
			duration = safePlayerNumber(() => player?.getDuration()) ?? duration;
		}
		await emitProgress({ eventType: 'completed' });
	}
</script>

<div class="space-y-4">
	<div class="relative overflow-hidden rounded-xl bg-black shadow-sm">
		<div class="aspect-video w-full" bind:this={mountElement}></div>

		{#if !ready}
			<div class="absolute inset-0 grid place-items-center bg-black text-sm font-medium text-white">
				Cargando video...
			</div>
		{/if}

		{#if activePausePoint}
			<div class="absolute inset-0 flex items-center justify-center bg-black/72 p-6">
				<div
					class="max-w-xl rounded-xl border border-white/15 bg-gray-950/92 p-5 text-white shadow-xl"
				>
					<p class="text-xs font-semibold tracking-wide text-amber-300 uppercase">Pausa guiada</p>
					<h3 class="mt-2 text-lg font-semibold">
						{activePausePoint.title || 'Antes de continuar'}
					</h3>
					{#if activePausePoint.body}
						<p class="mt-2 text-sm leading-6 text-gray-200">{activePausePoint.body}</p>
					{/if}
					<button
						type="button"
						class="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
						onclick={acknowledgePausePoint}
						disabled={isReadOnly}
					>
						{activePausePoint.resumeLabel || 'Continuar video'}
					</button>
				</div>
			</div>
		{/if}
	</div>

	<div class="space-y-2">
		<div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
			<div
				class="bg-primary-600 h-full rounded-full transition-[width]"
				style={`width: ${Math.round(watchPercent * 100)}%`}
			></div>
		</div>
		<div
			class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400"
		>
			<span>{Math.round(watchPercent * 100)}% visto</span>
			<span>
				{completed
					? 'Video completado'
					: reachedPausePointIds.length > 0
						? `${reachedPausePointIds.length} pausa${reachedPausePointIds.length === 1 ? '' : 's'} confirmada${reachedPausePointIds.length === 1 ? '' : 's'}`
						: 'Reproducción guiada'}
			</span>
		</div>
	</div>
</div>
