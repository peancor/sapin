CREATE TABLE `agent_memory_canvas` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`course_id` text,
	`activity_id` text,
	`student_id` text NOT NULL,
	`content` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_source_chat_id` text,
	`last_source_tool_call_id` text,
	`last_model_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_source_chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_memory_canvas_scope_key_idx` ON `agent_memory_canvas` (`scope_key`);--> statement-breakpoint
CREATE INDEX `agent_memory_canvas_student_idx` ON `agent_memory_canvas` (`student_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `agent_memory_canvas_scope_type_idx` ON `agent_memory_canvas` (`scope_type`,`updated_at`);--> statement-breakpoint
CREATE TABLE `agent_memory_canvas_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`canvas_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`course_id` text,
	`activity_id` text,
	`student_id` text NOT NULL,
	`revision` integer NOT NULL,
	`content` text NOT NULL,
	`change_summary` text,
	`source_event_type` text DEFAULT 'sync_update' NOT NULL,
	`source_chat_id` text,
	`source_tool_call_id` text,
	`model_name` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`canvas_id`) REFERENCES `agent_memory_canvas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_memory_canvas_revision_canvas_revision_idx` ON `agent_memory_canvas_revision` (`canvas_id`,`revision`);--> statement-breakpoint
CREATE INDEX `agent_memory_canvas_revision_scope_idx` ON `agent_memory_canvas_revision` (`scope_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_memory_canvas_revision_student_idx` ON `agent_memory_canvas_revision` (`student_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_memory_canvas_sync_event` (
	`id` text PRIMARY KEY NOT NULL,
	`canvas_id` text,
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`course_id` text,
	`activity_id` text,
	`student_id` text NOT NULL,
	`chat_id` text,
	`tool_call_id` text,
	`model_name` text,
	`status` text NOT NULL,
	`change_summary` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`canvas_id`) REFERENCES `agent_memory_canvas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_memory_canvas_sync_scope_idx` ON `agent_memory_canvas_sync_event` (`scope_key`,`chat_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_memory_canvas_sync_status_idx` ON `agent_memory_canvas_sync_event` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_memory_canvas_sync_student_idx` ON `agent_memory_canvas_sync_event` (`student_id`,`created_at`);