CREATE TABLE `interactive_lesson_block_visit` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`block_id` text NOT NULL,
	`visit_number` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`entered_at` integer NOT NULL,
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
CREATE INDEX `interactive_lesson_block_visit_session_idx` ON `interactive_lesson_block_visit` (`session_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_block_visit_session_block_idx` ON `interactive_lesson_block_visit` (`session_id`,`block_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_block_visit_chat_idx` ON `interactive_lesson_block_visit` (`chat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `interactive_lesson_block_visit_session_visit_idx` ON `interactive_lesson_block_visit` (`session_id`,`visit_number`);--> statement-breakpoint
ALTER TABLE `interactive_lesson_block_state` ADD `last_visit_id` text;--> statement-breakpoint
CREATE INDEX `interactive_lesson_block_state_last_visit_idx` ON `interactive_lesson_block_state` (`last_visit_id`);--> statement-breakpoint
ALTER TABLE `interactive_lesson_event` ADD `visit_id` text;--> statement-breakpoint
CREATE INDEX `interactive_lesson_event_visit_idx` ON `interactive_lesson_event` (`visit_id`);--> statement-breakpoint
ALTER TABLE `interactive_lesson_session` ADD `current_visit_id` text;--> statement-breakpoint
CREATE INDEX `interactive_lesson_session_current_visit_idx` ON `interactive_lesson_session` (`current_visit_id`);