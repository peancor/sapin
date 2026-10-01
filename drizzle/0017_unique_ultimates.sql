CREATE TABLE `interactive_learning_lesson` (
	`id` text PRIMARY KEY NOT NULL,
	`session_policy` text DEFAULT 'resume_latest' NOT NULL,
	`allow_restart` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interactive_learning_lesson_policy_idx` ON `interactive_learning_lesson` (`session_policy`);--> statement-breakpoint
CREATE TABLE `interactive_lesson_block_state` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`block_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`visit_count` integer DEFAULT 0 NOT NULL,
	`entered_at` integer,
	`completed_at` integer,
	`last_choice_value` text,
	`outputs_json` text,
	`chat_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `interactive_lesson_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `interactive_lesson_block_state_session_idx` ON `interactive_lesson_block_state` (`session_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_block_state_chat_idx` ON `interactive_lesson_block_state` (`chat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `interactive_lesson_block_state_session_block_idx` ON `interactive_lesson_block_state` (`session_id`,`block_id`);--> statement-breakpoint
CREATE TABLE `interactive_lesson_event` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`block_id` text,
	`event_type` text NOT NULL,
	`payload_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `interactive_lesson_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interactive_lesson_event_activity_idx` ON `interactive_lesson_event` (`interactive_learning_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_event_session_idx` ON `interactive_lesson_event` (`session_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_event_user_idx` ON `interactive_lesson_event` (`user_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_event_course_idx` ON `interactive_lesson_event` (`course_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_event_type_idx` ON `interactive_lesson_event` (`event_type`);--> statement-breakpoint
CREATE TABLE `interactive_lesson_session` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_id` text NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`attempt_number` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_block_id` text NOT NULL,
	`session_state_json` text,
	`started_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning_lesson`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interactive_lesson_session_activity_idx` ON `interactive_lesson_session` (`interactive_learning_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_session_user_idx` ON `interactive_lesson_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_session_course_idx` ON `interactive_lesson_session` (`course_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_session_status_idx` ON `interactive_lesson_session` (`status`);