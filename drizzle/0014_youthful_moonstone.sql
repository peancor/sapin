CREATE TABLE `ai_request_capture_focus` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`reason` text,
	`expires_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_request_capture_focus_target_idx` ON `ai_request_capture_focus` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `ai_request_capture_focus_enabled_idx` ON `ai_request_capture_focus` (`enabled`,`expires_at`);--> statement-breakpoint
CREATE INDEX `ai_request_capture_focus_createdBy_idx` ON `ai_request_capture_focus` (`created_by`);--> statement-breakpoint
CREATE TABLE `ai_request_round` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_id` text,
	`chat_id` text,
	`user_id` text,
	`course_id` text,
	`model_name` text,
	`round_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`usage_log_id` text,
	`system_prompt_exact` text,
	`messages_exact_json` text,
	`tools_exact_json` text,
	`request_options_json` text,
	`rag_context_exact` text,
	`rag_sources_json` text,
	`memory_context_exact` text,
	`request_payload_json` text,
	`response_summary_json` text,
	`provider_usage_json` text,
	`request_hash` text,
	`system_prompt_hash` text,
	`messages_hash` text,
	`rag_context_hash` text,
	`memory_context_hash` text,
	`tools_hash` text,
	`request_chars` integer,
	`system_prompt_chars` integer,
	`messages_chars` integer,
	`rag_context_chars` integer,
	`memory_context_chars` integer,
	`tools_chars` integer,
	`request_approx_tokens` integer,
	`system_prompt_approx_tokens` integer,
	`messages_approx_tokens` integer,
	`rag_context_approx_tokens` integer,
	`memory_context_approx_tokens` integer,
	`tools_approx_tokens` integer,
	`message_count` integer DEFAULT 0 NOT NULL,
	`tool_count` integer DEFAULT 0 NOT NULL,
	`rag_enabled` integer DEFAULT false NOT NULL,
	`rag_context_used` integer DEFAULT false NOT NULL,
	`memory_context_used` integer DEFAULT false NOT NULL,
	`resumed` integer DEFAULT false NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer,
	`reasoning_tokens` integer,
	`duration_ms` integer,
	`error_message` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_request_round_activity_idx` ON `ai_request_round` (`interactive_learning_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `ai_request_round_chat_idx` ON `ai_request_round` (`chat_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `ai_request_round_status_idx` ON `ai_request_round` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `ai_request_round_finished_idx` ON `ai_request_round` (`finished_at`);--> statement-breakpoint
CREATE INDEX `ai_request_round_usage_log_idx` ON `ai_request_round` (`usage_log_id`);--> statement-breakpoint
ALTER TABLE `ai_usage_log` ADD `request_round_id` text REFERENCES ai_request_round(id);--> statement-breakpoint
CREATE INDEX `ai_usage_log_requestRoundId_idx` ON `ai_usage_log` (`request_round_id`);