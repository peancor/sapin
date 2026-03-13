export const LEGACY_MEMORY_READ_TOOL_NAME = 'get_student_activity_memory_context';
export const LEGACY_MEMORY_WRITE_TOOL_NAME = 'store_student_activity_memory';
export const MEMORY_READ_TOOL_NAME = 'get_student_course_memory_context';
export const MEMORY_WRITE_TOOL_NAME = 'store_student_course_memory';

export const ALL_MEMORY_READ_TOOL_NAMES = [MEMORY_READ_TOOL_NAME, LEGACY_MEMORY_READ_TOOL_NAME] as const;
export const ALL_MEMORY_WRITE_TOOL_NAMES = [MEMORY_WRITE_TOOL_NAME, LEGACY_MEMORY_WRITE_TOOL_NAME] as const;

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
