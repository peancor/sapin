export const STUDENT_COURSE_CANVAS_READ_TOOL_NAME = 'student_course_canvas_read';
export const STUDENT_COURSE_CANVAS_UPDATE_TOOL_NAME = 'student_course_canvas_update';
export const STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME = 'student_activity_canvas_read';
export const STUDENT_ACTIVITY_CANVAS_UPDATE_TOOL_NAME = 'student_activity_canvas_update';

export const COURSE_CANVAS_TOOL_NAMES = [
	STUDENT_COURSE_CANVAS_READ_TOOL_NAME,
	STUDENT_COURSE_CANVAS_UPDATE_TOOL_NAME
] as const;

export const ACTIVITY_CANVAS_TOOL_NAMES = [
	STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME,
	STUDENT_ACTIVITY_CANVAS_UPDATE_TOOL_NAME
] as const;

export const ALL_MEMORY_TOOL_NAMES = [
	...COURSE_CANVAS_TOOL_NAMES,
	...ACTIVITY_CANVAS_TOOL_NAMES
] as const;

// Legacy aliases kept so deprecated modules still typecheck until they disappear from the repo.
export const STUDENT_ACTIVITY_MEMORY_TOOL_NAME = STUDENT_ACTIVITY_CANVAS_READ_TOOL_NAME;
export const STUDENT_COURSE_MEMORY_TOOL_NAME = STUDENT_COURSE_CANVAS_READ_TOOL_NAME;
export const MEMORY_SCOPE_RESERVED_INPUT_KEYS = [
	'userId',
	'courseId',
	'activityId',
	'scopeKey',
	'scopeType',
	'privacyClass',
	'subjectUserId',
	'createdByUserId'
] as const;
export const MEMORY_PROMPT_PREFETCH_LIMIT = 0;
