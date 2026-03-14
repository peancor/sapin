export const STUDENT_ACTIVITY_MEMORY_TOOL_NAME = 'student_activity_memory';
export const STUDENT_COURSE_MEMORY_TOOL_NAME = 'student_course_memory';

export const ALL_MEMORY_TOOL_NAMES = [
	STUDENT_COURSE_MEMORY_TOOL_NAME,
	STUDENT_ACTIVITY_MEMORY_TOOL_NAME
] as const;

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

export const MEMORY_PROMPT_PREFETCH_LIMIT = 4;
