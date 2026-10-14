CREATE TABLE `radar_action` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`activity_id` text,
	`definition` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `radar_action_course_idx` ON `radar_action` (`course_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `radar_action_execution` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`action_id` text,
	`actor_id` text,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`model_id` text NOT NULL,
	`state` text NOT NULL,
	`snapshot` text,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`lease_until` integer,
	FOREIGN KEY (`run_id`) REFERENCES `radar_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`action_id`) REFERENCES `radar_action`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `radar_action_execution_history_idx` ON `radar_action_execution` (`run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `radar_action_execution_work_idx` ON `radar_action_execution` (`state`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `radar_action_request_idx` ON `radar_action_execution` (`run_id`,`actor_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `radar_action_active_idx` ON `radar_action_execution` (`run_id`,`action_id`,`actor_id`) WHERE "radar_action_execution"."state" IN ('queued', 'processing');