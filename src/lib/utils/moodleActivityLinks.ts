export interface MoodleActivityLinkTarget {
	id: string;
	type: string;
}

export function getMoodleActivityStudentPath(interactive: MoodleActivityLinkTarget): string {
	if (interactive.type === 'agent') return `/student/run-agent/${interactive.id}`;
	if (interactive.type === 'lesson') return `/student/run-lesson/${interactive.id}`;
	return `/student/run-chat/${interactive.id}`;
}

export function buildMoodleActivityBaseUrl(
	interactive: MoodleActivityLinkTarget,
	origin: string
): string {
	return `${origin.replace(/\/$/, '')}${getMoodleActivityStudentPath(interactive)}`;
}

export function buildMoodleActivityFilterCodesUrl(
	interactive: MoodleActivityLinkTarget,
	origin: string
): string {
	return `${buildMoodleActivityBaseUrl(interactive, origin)}?externalId={userid}`;
}
