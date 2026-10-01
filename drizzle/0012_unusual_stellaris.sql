CREATE TABLE `insights_agent_activity_tool` (
	`id` text PRIMARY KEY NOT NULL,
	`insights_agent_id` text NOT NULL,
	`tool_definition_id` text NOT NULL,
	`config_override` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`insights_agent_id`) REFERENCES `interactive_learning_insights_agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_definition_id`) REFERENCES `agent_tool_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `insights_agent_activity_tool_agent_idx` ON `insights_agent_activity_tool` (`insights_agent_id`);--> statement-breakpoint
CREATE INDEX `insights_agent_activity_tool_def_idx` ON `insights_agent_activity_tool` (`tool_definition_id`);--> statement-breakpoint
CREATE TABLE `insights_agent_run` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`title` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`summary` text,
	`scope` text NOT NULL,
	`metadata` text,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `insights_agent_run_interactive_idx` ON `insights_agent_run` (`interactive_learning_id`);--> statement-breakpoint
CREATE INDEX `insights_agent_run_creator_idx` ON `insights_agent_run` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `insights_agent_run_chat_idx` ON `insights_agent_run` (`chat_id`);--> statement-breakpoint
CREATE INDEX `insights_agent_run_status_idx` ON `insights_agent_run` (`status`);--> statement-breakpoint
CREATE TABLE `interactive_learning_insights_agent` (
	`id` text PRIMARY KEY NOT NULL,
	`llm_role` text,
	`llm_instructions` text,
	`llm_context` text,
	`system_prompt` text,
	`llm_model` text,
	`temperature` real,
	`max_tokens` integer,
	`top_p` real,
	`max_tool_roundtrips` integer DEFAULT 8 NOT NULL,
	`parallel_tool_calls` integer DEFAULT false NOT NULL,
	`tool_choice` text DEFAULT 'auto' NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interactive_learning_insights_agent_model_idx` ON `interactive_learning_insights_agent` (`llm_model`);