export const YOUTUBE_COMPLETION_TOLERANCE_RATIO = 0.1;
export const YOUTUBE_COMPLETION_TOLERANCE_MIN_SECONDS = 1;
export const YOUTUBE_COMPLETION_TOLERANCE_MAX_SECONDS = 5;
export const YOUTUBE_COMPLETION_WATCH_PERCENT_FALLBACK = 0.9;

interface YoutubeSegmentProgressInput {
	currentTime?: number | null;
	startSeconds?: number | null;
	endSeconds?: number | null;
	duration?: number | null;
	watchPercent?: number | null;
	alreadyCompleted?: boolean;
}

interface YoutubeSegmentProgress {
	currentTime: number;
	startSeconds: number;
	segmentEndSeconds: number | null;
	segmentLength: number | null;
	watchPercent: number;
	remainingSeconds: number | null;
	completionToleranceSeconds: number;
	completeEnough: boolean;
}

function finiteNumber(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function getYoutubeSegmentProgress(
	input: YoutubeSegmentProgressInput
): YoutubeSegmentProgress {
	const startSeconds = Math.max(0, finiteNumber(input.startSeconds) ?? 0);
	const currentTime = Math.max(0, finiteNumber(input.currentTime) ?? startSeconds);
	const duration = finiteNumber(input.duration);
	const positiveDuration = duration !== null && duration > 0 ? duration : null;
	const endSeconds = finiteNumber(input.endSeconds);
	const segmentEndSeconds =
		endSeconds !== null && endSeconds > startSeconds ? endSeconds : positiveDuration;
	const segmentLength =
		segmentEndSeconds !== null && segmentEndSeconds > startSeconds
			? segmentEndSeconds - startSeconds
			: positiveDuration !== null && positiveDuration > startSeconds
				? positiveDuration - startSeconds
				: null;
	const inputWatchPercent = finiteNumber(input.watchPercent);
	const fallbackWatchPercent = inputWatchPercent !== null ? clamp01(inputWatchPercent) : 0;
	const rawWatchPercent =
		segmentLength !== null && segmentLength > 0
			? clamp01((currentTime - startSeconds) / segmentLength)
			: fallbackWatchPercent;
	const watchPercent = input.alreadyCompleted ? 1 : rawWatchPercent;
	const remainingSeconds =
		segmentEndSeconds !== null ? Math.max(0, segmentEndSeconds - currentTime) : null;
	const completionToleranceSeconds =
		segmentLength !== null && segmentLength > 0
			? Math.min(
					YOUTUBE_COMPLETION_TOLERANCE_MAX_SECONDS,
					Math.max(
						YOUTUBE_COMPLETION_TOLERANCE_MIN_SECONDS,
						segmentLength * YOUTUBE_COMPLETION_TOLERANCE_RATIO
					)
				)
			: 0;
	const completeEnough =
		input.alreadyCompleted === true ||
		watchPercent >= 1 ||
		(remainingSeconds !== null && remainingSeconds <= completionToleranceSeconds) ||
		(segmentLength === null && watchPercent >= YOUTUBE_COMPLETION_WATCH_PERCENT_FALLBACK);

	return {
		currentTime,
		startSeconds,
		segmentEndSeconds,
		segmentLength,
		watchPercent,
		remainingSeconds,
		completionToleranceSeconds,
		completeEnough
	};
}

export function isYoutubeSegmentCompleteEnough(input: YoutubeSegmentProgressInput): boolean {
	return getYoutubeSegmentProgress(input).completeEnough;
}
