CREATE TABLE `agent_activity_tool` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_activity_id` text NOT NULL,
	`tool_definition_id` text NOT NULL,
	`config_override` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_activity_id`) REFERENCES `interactive_learning_agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_definition_id`) REFERENCES `agent_tool_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_activity_tool_activity_idx` ON `agent_activity_tool` (`agent_activity_id`);--> statement-breakpoint
CREATE INDEX `agent_activity_tool_def_idx` ON `agent_activity_tool` (`tool_definition_id`);--> statement-breakpoint
CREATE TABLE `agent_activity_ui_component` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_activity_id` text NOT NULL,
	`ui_component_id` text NOT NULL,
	`config_override` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_activity_id`) REFERENCES `interactive_learning_agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ui_component_id`) REFERENCES `agent_ui_component`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_activity_ui_activity_idx` ON `agent_activity_ui_component` (`agent_activity_id`);--> statement-breakpoint
CREATE INDEX `agent_activity_ui_comp_idx` ON `agent_activity_ui_component` (`ui_component_id`);--> statement-breakpoint
CREATE TABLE `agent_message` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`text_content` text,
	`tool_call_id` text,
	`tool_name` text,
	`sequence_order` integer DEFAULT 0 NOT NULL,
	`token_count` integer,
	`finish_reason` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_message_chat_idx` ON `agent_message` (`chat_id`);--> statement-breakpoint
CREATE INDEX `agent_message_role_idx` ON `agent_message` (`role`);--> statement-breakpoint
CREATE INDEX `agent_message_tool_call_idx` ON `agent_message` (`tool_call_id`);--> statement-breakpoint
CREATE INDEX `agent_message_created_idx` ON `agent_message` (`created_at`);--> statement-breakpoint
CREATE TABLE `agent_tool_call` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`tool_definition_id` text,
	`arguments` text NOT NULL,
	`result` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirmed_by` text,
	`confirmed_at` integer,
	`rejection_reason` text,
	`duration_ms` integer,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `agent_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_definition_id`) REFERENCES `agent_tool_definition`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_tool_call_message_idx` ON `agent_tool_call` (`message_id`);--> statement-breakpoint
CREATE INDEX `agent_tool_call_status_idx` ON `agent_tool_call` (`status`);--> statement-breakpoint
CREATE INDEX `agent_tool_call_tool_def_idx` ON `agent_tool_call` (`tool_definition_id`);--> statement-breakpoint
CREATE TABLE `agent_tool_definition` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`parameters_schema` text NOT NULL,
	`response_schema` text,
	`executor_type` text DEFAULT 'builtin' NOT NULL,
	`executor_config` text DEFAULT '{}' NOT NULL,
	`requires_confirmation` integer DEFAULT false NOT NULL,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`required_permissions` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tool_definition_name_unique` ON `agent_tool_definition` (`name`);--> statement-breakpoint
CREATE INDEX `agent_tool_def_name_idx` ON `agent_tool_definition` (`name`);--> statement-breakpoint
CREATE INDEX `agent_tool_def_category_idx` ON `agent_tool_definition` (`category`);--> statement-breakpoint
CREATE INDEX `agent_tool_def_active_idx` ON `agent_tool_definition` (`is_active`);--> statement-breakpoint
CREATE TABLE `agent_ui_component` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`props_schema` text NOT NULL,
	`response_schema` text,
	`component_key` text NOT NULL,
	`render_config` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_ui_component_name_unique` ON `agent_ui_component` (`name`);--> statement-breakpoint
CREATE INDEX `agent_ui_component_name_idx` ON `agent_ui_component` (`name`);--> statement-breakpoint
CREATE INDEX `agent_ui_component_key_idx` ON `agent_ui_component` (`component_key`);--> statement-breakpoint
CREATE TABLE `agent_ui_instance` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`ui_component_id` text NOT NULL,
	`props` text NOT NULL,
	`state` text,
	`user_response` text,
	`responded_at` integer,
	`score` real,
	`evaluation_data` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `agent_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ui_component_id`) REFERENCES `agent_ui_component`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_ui_instance_message_idx` ON `agent_ui_instance` (`message_id`);--> statement-breakpoint
CREATE INDEX `agent_ui_instance_component_idx` ON `agent_ui_instance` (`ui_component_id`);--> statement-breakpoint
CREATE TABLE `interactive_learning_agent` (
	`id` text PRIMARY KEY NOT NULL,
	`llm_role` text,
	`llm_instructions` text,
	`llm_context` text,
	`system_prompt` text,
	`llm_model` text,
	`temperature` real,
	`max_tokens` integer,
	`top_p` real,
	`max_tool_roundtrips` integer DEFAULT 5 NOT NULL,
	`parallel_tool_calls` integer DEFAULT false NOT NULL,
	`tool_choice` text DEFAULT 'auto' NOT NULL,
	`rag_enabled` integer DEFAULT false,
	`rag_collection_name` text,
	`rag_config` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade
);
