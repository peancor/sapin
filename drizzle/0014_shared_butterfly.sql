UPDATE `agent_memory`
SET
	`scope_type` = 'student_course',
	`scope_key` = 'student:' || `subject_user_id` || ':course:' || `course_id`,
	`dedupe_key` = CASE
		WHEN `dedupe_key` IS NOT NULL THEN `dedupe_key` || ':legacy-activity:' || COALESCE(`activity_id`, 'none')
		ELSE NULL
	END
WHERE `scope_type` = 'student_activity'
	AND `course_id` IS NOT NULL
	AND `subject_user_id` IS NOT NULL;
