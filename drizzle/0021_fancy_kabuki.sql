CREATE TABLE `radar_analysis` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`owner` text NOT NULL,
	`model_id` text NOT NULL,
	`analyzer_version` text NOT NULL,
	`state` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`processed` integer DEFAULT 0 NOT NULL,
	`batches` integer DEFAULT 0 NOT NULL,
	`coverage` text,
	`summary` text,
	`error` text,
	FOREIGN KEY (`run_id`) REFERENCES `radar_run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `radar_analysis_run_idx` ON `radar_analysis` (`run_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `radar_observation` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`message_id` text,
	`agent_message_id` text,
	`chat_id` text NOT NULL,
	`student_id` text NOT NULL,
	`at` integer NOT NULL,
	`status` text NOT NULL,
	`intent` text,
	`confusion` text,
	`evidence_ids` text,
	`insufficient_context` integer DEFAULT false NOT NULL,
	`truncated` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `radar_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_message_id`) REFERENCES `agent_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "radar_observation_source_check" CHECK(("radar_observation"."message_id" IS NULL) != ("radar_observation"."agent_message_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_observation_message_idx` ON `radar_observation` (`run_id`,`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `radar_observation_agent_idx` ON `radar_observation` (`run_id`,`agent_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `radar_observation_scope_idx` ON `radar_observation` (`run_id`,`id`);--> statement-breakpoint
CREATE INDEX `radar_observation_time_idx` ON `radar_observation` (`run_id`,`at`);--> statement-breakpoint
CREATE INDEX `radar_observation_student_idx` ON `radar_observation` (`run_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `radar_observation_pending_idx` ON `radar_observation` (`run_id`,`status`,`at`);--> statement-breakpoint
CREATE TABLE `radar_observation_topic` (
	`run_id` text NOT NULL,
	`observation_id` text NOT NULL,
	`topic_id` text NOT NULL,
	PRIMARY KEY(`observation_id`, `topic_id`),
	FOREIGN KEY (`run_id`,`observation_id`) REFERENCES `radar_observation`(`run_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`,`topic_id`) REFERENCES `radar_topic`(`run_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `radar_topic_evidence_idx` ON `radar_observation_topic` (`run_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `radar_run` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`course_activity_id` text NOT NULL,
	`creator_id` text,
	`title` text NOT NULL,
	`activity_type` text NOT NULL,
	`model_id` text NOT NULL,
	`model_name` text NOT NULL,
	`context` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`analysis_state` text DEFAULT 'pending' NOT NULL,
	`next_analysis_at` integer NOT NULL,
	`lease_owner` text,
	`lease_until` integer,
	`summary` text,
	`error` text,
	`analyzed_at` integer,
	`published_version` integer DEFAULT 0 NOT NULL,
	`published_observation_count` integer DEFAULT 0 NOT NULL,
	`evidence_version` integer DEFAULT 0 NOT NULL,
	`synthesis_pending` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_activity_id`) REFERENCES `course_interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "radar_interval_check" CHECK("radar_run"."ends_at" >= "radar_run"."starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_one_active_idx` ON `radar_run` (`course_id`,`activity_id`) WHERE "radar_run"."state" = 'active';--> statement-breakpoint
CREATE INDEX `radar_history_idx` ON `radar_run` (`course_id`,`activity_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `radar_work_idx` ON `radar_run` (`state`,`next_analysis_at`,`lease_until`);--> statement-breakpoint
CREATE TABLE `radar_topic` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`description` text NOT NULL,
	`suggestion` text,
	`suggestion_evidence` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `radar_run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_topic_title_idx` ON `radar_topic` (`run_id`,`normalized_title`);--> statement-breakpoint
CREATE UNIQUE INDEX `radar_topic_scope_idx` ON `radar_topic` (`run_id`,`id`);--> statement-breakpoint
CREATE INDEX `message_chat_time_idx` ON `message` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_message_chat_time_idx` ON `agent_message` (`chat_id`,`created_at`);