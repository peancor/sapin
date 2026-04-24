export type LessonStudioSource = 'activity' | 'studio' | 'flow' | 'block' | 'resources' | 'review';
export type LessonStudioDebugView = 'student' | 'debug';
export type LessonStudioDebugIntent = 'inspect' | 'run';

export type LessonStudioRouteContext = {
	cid: string;
	ilid: string;
};

export type LessonStudioReturnTarget = {
	href: string;
	label: string;
	source: LessonStudioSource;
};

export type LessonStudioDebuggerOptions = {
	source?: LessonStudioSource;
	blockId?: string | null;
	view?: LessonStudioDebugView;
	intent?: LessonStudioDebugIntent;
	fresh?: boolean;
	mode?: 'draft' | 'published';
};

export function isLessonStudioSource(
	value: string | null | undefined
): value is LessonStudioSource {
	return (
		value === 'activity' ||
		value === 'studio' ||
		value === 'flow' ||
		value === 'block' ||
		value === 'resources' ||
		value === 'review'
	);
}

export function lessonActivityHref({ cid, ilid }: LessonStudioRouteContext) {
	return `/course/${cid}/admin/interactives/${ilid}`;
}

export function lessonStudioHref({ cid, ilid }: LessonStudioRouteContext) {
	return `/course/${cid}/admin/interactives/${ilid}/lessonedit`;
}

export function lessonFlowHref({ cid, ilid }: LessonStudioRouteContext, blockId?: string | null) {
	const base = `/course/${cid}/admin/interactives/${ilid}/lessonedit/flow`;
	return blockId ? `${base}?blockId=${encodeURIComponent(blockId)}` : base;
}

export function lessonBlockHref({ cid, ilid }: LessonStudioRouteContext, blockId: string) {
	return `/course/${cid}/admin/interactives/${ilid}/lessonedit/blocks/${encodeURIComponent(blockId)}`;
}

export function lessonResourcesHref(
	context: LessonStudioRouteContext,
	options: { source?: LessonStudioSource; blockId?: string | null } = {}
) {
	const params = new URLSearchParams();
	params.set('source', options.source ?? 'studio');

	if (options.blockId) {
		params.set('blockId', options.blockId);
	}

	return `${lessonStudioHref(context)}/resources?${params.toString()}`;
}

export function lessonReviewHref(
	{ cid, ilid }: LessonStudioRouteContext,
	sessionId?: string | null
) {
	const base = `/course/${cid}/admin/interactives/${ilid}/lesson-review`;
	return sessionId ? `${base}/${encodeURIComponent(sessionId)}` : base;
}

export function lessonDebuggerHref(
	context: LessonStudioRouteContext,
	options: LessonStudioDebuggerOptions = {}
) {
	const params = new URLSearchParams({
		mode: options.mode ?? 'draft',
		source: options.source ?? 'studio'
	});

	if (options.blockId) {
		params.set('blockId', options.blockId);
	}

	if (options.view) {
		params.set('view', options.view);
	}

	if (options.intent) {
		params.set('intent', options.intent);
	}

	if (options.fresh) {
		params.set('fresh', '1');
	}

	return `${lessonActivityHref(context)}/lesson-debug?${params.toString()}`;
}

export function lessonStudioReturnTarget(
	context: LessonStudioRouteContext,
	source: string | null | undefined,
	blockId?: string | null
): LessonStudioReturnTarget {
	const safeSource = isLessonStudioSource(source) ? source : 'activity';

	if (safeSource === 'block' && blockId) {
		return {
			href: lessonBlockHref(context, blockId),
			label: 'Volver al bloque',
			source: safeSource
		};
	}

	if (safeSource === 'flow') {
		return {
			href: lessonFlowHref(context, blockId),
			label: 'Volver al mapa',
			source: safeSource
		};
	}

	if (safeSource === 'resources') {
		return {
			href: lessonResourcesHref(context, { source: 'studio' }),
			label: 'Volver a recursos',
			source: safeSource
		};
	}

	if (safeSource === 'review') {
		return {
			href: lessonReviewHref(context),
			label: 'Volver a review',
			source: safeSource
		};
	}

	if (safeSource === 'studio') {
		return {
			href: lessonStudioHref(context),
			label: 'Volver al studio',
			source: safeSource
		};
	}

	return {
		href: lessonActivityHref(context),
		label: 'Volver a la actividad',
		source: 'activity'
	};
}
