CREATE TABLE `radar_preset` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`initial_view` text DEFAULT 'list' NOT NULL,
	`initial_metric` text DEFAULT 'students' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `radar_preset_course_idx` ON `radar_preset` (`course_id`);--> statement-breakpoint
ALTER TABLE `radar_analysis` ADD `settings_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_analysis` ADD `instructions` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `instructions` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `settings_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `summary_settings_revision` integer;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `summary_instructions` text;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `settings_updated_by` text;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `settings_updated_at` integer;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `initial_view` text DEFAULT 'list' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `initial_metric` text DEFAULT 'students' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_run` ADD `synthesis_coverage` text;