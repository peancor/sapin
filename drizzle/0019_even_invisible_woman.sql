CREATE TABLE `interactive_learning_lesson_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`definition_json` text NOT NULL,
	`created_by` text,
	`based_on_revision_id` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning_lesson`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`based_on_revision_id`) REFERENCES `interactive_learning_lesson_revision`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `interactive_learning_lesson_revision_activity_idx` ON `interactive_learning_lesson_revision` (`interactive_learning_id`);--> statement-breakpoint
CREATE INDEX `interactive_learning_lesson_revision_status_idx` ON `interactive_learning_lesson_revision` (`status`);--> statement-breakpoint
CREATE INDEX `interactive_learning_lesson_revision_based_on_idx` ON `interactive_learning_lesson_revision` (`based_on_revision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `interactive_learning_lesson_revision_activity_number_idx` ON `interactive_learning_lesson_revision` (`interactive_learning_id`,`revision_number`);--> statement-breakpoint
ALTER TABLE `interactive_learning_lesson` ADD `draft_revision_id` text REFERENCES interactive_learning_lesson_revision(id);--> statement-breakpoint
ALTER TABLE `interactive_learning_lesson` ADD `published_revision_id` text REFERENCES interactive_learning_lesson_revision(id);--> statement-breakpoint
CREATE INDEX `interactive_learning_lesson_draft_revision_idx` ON `interactive_learning_lesson` (`draft_revision_id`);--> statement-breakpoint
CREATE INDEX `interactive_learning_lesson_published_revision_idx` ON `interactive_learning_lesson` (`published_revision_id`);--> statement-breakpoint
ALTER TABLE `interactive_lesson_block_state` ADD `scope` text DEFAULT 'learner' NOT NULL;--> statement-breakpoint
CREATE INDEX `interactive_lesson_block_state_scope_idx` ON `interactive_lesson_block_state` (`scope`);--> statement-breakpoint
ALTER TABLE `interactive_lesson_block_visit` ADD `scope` text DEFAULT 'learner' NOT NULL;--> statement-breakpoint
CREATE INDEX `interactive_lesson_block_visit_scope_idx` ON `interactive_lesson_block_visit` (`scope`);--> statement-breakpoint
ALTER TABLE `interactive_lesson_event` ADD `scope` text DEFAULT 'learner' NOT NULL;--> statement-breakpoint
CREATE INDEX `interactive_lesson_event_scope_idx` ON `interactive_lesson_event` (`scope`);--> statement-breakpoint
ALTER TABLE `interactive_lesson_session` ADD `definition_revision_id` text REFERENCES interactive_learning_lesson_revision(id);--> statement-breakpoint
ALTER TABLE `interactive_lesson_session` ADD `definition_revision_number` integer;--> statement-breakpoint
ALTER TABLE `interactive_lesson_session` ADD `binding_status` text DEFAULT 'backfilled_current' NOT NULL;--> statement-breakpoint
ALTER TABLE `interactive_lesson_session` ADD `scope` text DEFAULT 'learner' NOT NULL;--> statement-breakpoint
CREATE INDEX `interactive_lesson_session_revision_idx` ON `interactive_lesson_session` (`definition_revision_id`);--> statement-breakpoint
CREATE INDEX `interactive_lesson_session_scope_idx` ON `interactive_lesson_session` (`scope`);