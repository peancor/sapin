CREATE TABLE `course_progress_summary` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`completed_activities` integer DEFAULT 0 NOT NULL,
	`in_progress_activities` integer DEFAULT 0 NOT NULL,
	`completion_rate` integer DEFAULT 0 NOT NULL,
	`total_time_spent_seconds` integer DEFAULT 0 NOT NULL,
	`last_activity_at` integer,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_progress_summary_userId_idx` ON `course_progress_summary` (`user_id`);--> statement-breakpoint
CREATE INDEX `course_progress_summary_courseId_idx` ON `course_progress_summary` (`course_id`);--> statement-breakpoint
CREATE TABLE `learning_activity_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`activity_type` text DEFAULT 'chat' NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`started_at` integer,
	`last_interaction_at` integer NOT NULL,
	`completed_at` integer,
	`attempts_count` integer DEFAULT 0 NOT NULL,
	`time_spent_seconds` integer DEFAULT 0 NOT NULL,
	`score_raw` integer,
	`score_normalized` integer,
	`mastery_level` integer,
	`metadata_json` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `learning_activity_progress_userId_idx` ON `learning_activity_progress` (`user_id`);--> statement-breakpoint
CREATE INDEX `learning_activity_progress_courseId_idx` ON `learning_activity_progress` (`course_id`);--> statement-breakpoint
CREATE INDEX `learning_activity_progress_activityId_idx` ON `learning_activity_progress` (`activity_id`);--> statement-breakpoint
CREATE INDEX `learning_activity_progress_status_idx` ON `learning_activity_progress` (`status`);--> statement-breakpoint
CREATE TABLE `learning_progress_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_at` integer NOT NULL,
	`source` text DEFAULT 'system' NOT NULL,
	`payload_json` text,
	`correlation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `learning_progress_event_userId_idx` ON `learning_progress_event` (`user_id`);--> statement-breakpoint
CREATE INDEX `learning_progress_event_courseId_idx` ON `learning_progress_event` (`course_id`);--> statement-breakpoint
CREATE INDEX `learning_progress_event_activityId_idx` ON `learning_progress_event` (`activity_id`);--> statement-breakpoint
CREATE INDEX `learning_progress_event_eventType_idx` ON `learning_progress_event` (`event_type`);--> statement-breakpoint
CREATE INDEX `learning_progress_event_eventAt_idx` ON `learning_progress_event` (`event_at`);--> statement-breakpoint
DROP TABLE `activity_progress`;--> statement-breakpoint
DROP TABLE `student_progress`;