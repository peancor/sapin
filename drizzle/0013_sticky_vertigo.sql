CREATE TABLE `agent_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`privacy_class` text NOT NULL,
	`course_id` text,
	`activity_id` text,
	`subject_user_id` text,
	`created_by_user_id` text,
	`source_kind` text NOT NULL,
	`memory_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`importance` integer DEFAULT 3 NOT NULL,
	`dedupe_key` text,
	`summary` text NOT NULL,
	`tags` text,
	`payload` text NOT NULL,
	`occurred_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_memory_scope_idx` ON `agent_memory` (`scope_type`,`scope_key`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_memory_subject_idx` ON `agent_memory` (`subject_user_id`,`course_id`,`activity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_memory_type_idx` ON `agent_memory` (`memory_type`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_memory_scope_dedupe_idx` ON `agent_memory` (`scope_key`,`memory_type`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `agent_memory_access_event` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text,
	`actor_user_id` text,
	`tool_name` text NOT NULL,
	`operation` text NOT NULL,
	`outcome` text NOT NULL,
	`scope_key` text NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`details` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`memory_id`) REFERENCES `agent_memory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_memory_access_scope_idx` ON `agent_memory_access_event` (`scope_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_memory_access_actor_idx` ON `agent_memory_access_event` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_memory_access_tool_idx` ON `agent_memory_access_event` (`tool_name`,`created_at`);