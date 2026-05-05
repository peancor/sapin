CREATE TABLE `agent_thread` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`title` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`summary` text,
	`last_message_at` integer,
	`deleted_at` integer,
	`deleted_by_user_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `agent_workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_thread_workspace_idx` ON `agent_thread` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `agent_thread_chat_idx` ON `agent_thread` (`chat_id`);--> statement-breakpoint
CREATE INDEX `agent_thread_deleted_idx` ON `agent_thread` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `agent_thread_updated_idx` ON `agent_thread` (`updated_at`);--> statement-breakpoint
CREATE TABLE `agent_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_key` text NOT NULL,
	`feature_key` text NOT NULL,
	`kind` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`owner_user_id` text,
	`llm_model` text,
	`llm_role` text,
	`llm_instructions` text,
	`llm_context` text,
	`system_prompt` text,
	`max_tool_roundtrips` integer DEFAULT 8 NOT NULL,
	`parallel_tool_calls` integer DEFAULT false NOT NULL,
	`tool_choice` text DEFAULT 'auto' NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_workspace_key_unique` ON `agent_workspace` (`workspace_key`);--> statement-breakpoint
CREATE INDEX `agent_workspace_feature_idx` ON `agent_workspace` (`feature_key`);--> statement-breakpoint
CREATE INDEX `agent_workspace_kind_idx` ON `agent_workspace` (`kind`);--> statement-breakpoint
CREATE INDEX `agent_workspace_scope_idx` ON `agent_workspace` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE INDEX `agent_workspace_owner_idx` ON `agent_workspace` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `agent_workspace_tool` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`tool_definition_id` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`config_override` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `agent_workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_definition_id`) REFERENCES `agent_tool_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_workspace_tool_workspace_idx` ON `agent_workspace_tool` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `agent_workspace_tool_tool_idx` ON `agent_workspace_tool` (`tool_definition_id`);