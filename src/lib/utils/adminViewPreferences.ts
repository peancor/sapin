import { browser } from '$app/environment';

export const adminViewPreferenceKeys = {
	interactivesIndexViewMode: 'course-admin:interactives:index:view-mode',
	agentReviewViewMode: 'course-admin:interactives:agent-review:view-mode'
} as const;

export type CourseAdminInteractiveViewMode = 'cards' | 'table';
export type AgentReviewViewMode = 'comfortable' | 'compact' | 'mini';

function readStoredViewPreference<T extends string>(
	storageKey: string,
	parseValue: (value: string | null | undefined) => T | null
): T | null {
	if (!browser) return null;

	return parseValue(window.localStorage.getItem(storageKey));
}

function writeStoredViewPreference<T extends string>(storageKey: string, value: T): void {
	if (!browser) return;

	window.localStorage.setItem(storageKey, value);
}

export function parseCourseAdminInteractiveViewMode(
	value: string | null | undefined
): CourseAdminInteractiveViewMode | null {
	switch (value) {
		case 'cards':
		case 'table':
			return value;
		default:
			return null;
	}
}

export function getStoredCourseAdminInteractiveViewMode(): CourseAdminInteractiveViewMode | null {
	return readStoredViewPreference(
		adminViewPreferenceKeys.interactivesIndexViewMode,
		parseCourseAdminInteractiveViewMode
	);
}

export function setStoredCourseAdminInteractiveViewMode(
	value: CourseAdminInteractiveViewMode
): void {
	writeStoredViewPreference(adminViewPreferenceKeys.interactivesIndexViewMode, value);
}

export function parseAgentReviewViewMode(value: string | null | undefined): AgentReviewViewMode | null {
	switch (value) {
		case 'compact':
		case 'mini':
		case 'comfortable':
			return value;
		default:
			return null;
	}
}

export function getStoredAgentReviewViewMode(): AgentReviewViewMode | null {
	return readStoredViewPreference(
		adminViewPreferenceKeys.agentReviewViewMode,
		parseAgentReviewViewMode
	);
}

export function setStoredAgentReviewViewMode(value: AgentReviewViewMode): void {
	writeStoredViewPreference(adminViewPreferenceKeys.agentReviewViewMode, value);
}