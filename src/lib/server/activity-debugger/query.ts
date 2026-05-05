import type {
	ActivityDebuggerFilters,
	ActivityDebuggerSessionFilters,
	ActivityDebuggerSessionStatus
} from '$lib/types/activityDebugger';

function parseCheckbox(value: string | null): boolean {
	return value === '1' || value === 'true' || value === 'on';
}

export function parseActivityDebuggerFilters(url: URL): ActivityDebuggerFilters {
	const type = url.searchParams.get('type');
	return {
		courseId: url.searchParams.get('courseId') || undefined,
		type: type === 'chat' || type === 'agent' ? type : 'all',
		search: url.searchParams.get('search') || undefined,
		dateFrom: url.searchParams.get('dateFrom'),
		dateTo: url.searchParams.get('dateTo'),
		onlyErrors: parseCheckbox(url.searchParams.get('onlyErrors')),
		onlyToolFailures: parseCheckbox(url.searchParams.get('onlyToolFailures')),
		onlyHighUsage: parseCheckbox(url.searchParams.get('onlyHighUsage')),
		onlyPendingSessions: parseCheckbox(url.searchParams.get('onlyPendingSessions'))
	};
}

export function parseActivityDebuggerSessionFilters(url: URL): ActivityDebuggerSessionFilters {
	const status = url.searchParams.get('status');
	return {
		search: url.searchParams.get('search') || undefined,
		dateFrom: url.searchParams.get('dateFrom'),
		dateTo: url.searchParams.get('dateTo'),
		status:
			status === 'completed' || status === 'pending' || status === 'attention'
				? (status as ActivityDebuggerSessionStatus)
				: 'all',
		onlyErrors: parseCheckbox(url.searchParams.get('onlyErrors')),
		onlyToolFailures: parseCheckbox(url.searchParams.get('onlyToolFailures')),
		onlyHighUsage: parseCheckbox(url.searchParams.get('onlyHighUsage'))
	};
}
