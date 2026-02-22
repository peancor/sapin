CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text,
	`external_id` text,
	`display_name` text,
	`alias` text,
	`age` integer,
	`image` text,
	`timezone` text DEFAULT 'UTC',
	`locale` text DEFAULT 'es',
	`password_hash` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`invite_code` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_login_at` integer,
	`failed_login_attempts` integer DEFAULT 0,
	`locked_until` integer,
	`preferences` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_external_id_unique` ON `user` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_invite_code_unique` ON `user` (`invite_code`);--> statement-breakpoint
CREATE INDEX `user_status_idx` ON `user` (`status`);--> statement-breakpoint
CREATE INDEX `user_lastLogin_idx` ON `user` (`last_login_at`);--> statement-breakpoint
CREATE TABLE `role` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`permissions` text,
	`level` integer DEFAULT 0 NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_name_unique` ON `role` (`name`);--> statement-breakpoint
CREATE TABLE `role_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`role_name` text NOT NULL,
	`action` text NOT NULL,
	`performed_by` text,
	`reason` text,
	`metadata` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`performed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `role_audit_log_userId_idx` ON `role_audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `role_audit_log_createdAt_idx` ON `role_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `user_role` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`assigned_by` text,
	`assigned_at` integer NOT NULL,
	`expires_at` integer,
	`reason` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `user_role_userId_idx` ON `user_role` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_role_roleId_idx` ON `user_role` (`role_id`);--> statement-breakpoint
CREATE INDEX `user_role_active_idx` ON `user_role` (`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `file_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`success` integer DEFAULT true NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `file_storage`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `file_access_log_fileId_idx` ON `file_access_log` (`file_id`);--> statement-breakpoint
CREATE INDEX `file_access_log_userId_idx` ON `file_access_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `file_access_log_createdAt_idx` ON `file_access_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `file_storage` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`internal_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`category` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`visibility` text NOT NULL,
	`permission_rules` text,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	`variants` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`last_accessed_at` integer,
	`access_count` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_orphan` integer DEFAULT false NOT NULL,
	`marked_for_deletion_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_storage_hash_idx` ON `file_storage` (`hash`);--> statement-breakpoint
CREATE INDEX `file_storage_category_idx` ON `file_storage` (`category`);--> statement-breakpoint
CREATE INDEX `file_storage_entityType_entityId_idx` ON `file_storage` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `file_storage_uploadedBy_idx` ON `file_storage` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX `file_storage_isOrphan_idx` ON `file_storage` (`is_orphan`);--> statement-breakpoint
CREATE INDEX `file_storage_markedForDeletion_idx` ON `file_storage` (`marked_for_deletion_at`);--> statement-breakpoint
CREATE TABLE `file_system_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_system_setting_key_unique` ON `file_system_setting` (`key`);--> statement-breakpoint
CREATE TABLE `chat` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`content` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	`token_count` integer NOT NULL,
	`finish_reason` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `course` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`image` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`settings` text,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_slug_unique` ON `course` (`slug`);--> statement-breakpoint
CREATE INDEX `course_slug_idx` ON `course` (`slug`);--> statement-breakpoint
CREATE INDEX `course_status_idx` ON `course` (`status`);--> statement-breakpoint
CREATE TABLE `course_file` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_file_idx` ON `course_file` (`course_id`);--> statement-breakpoint
CREATE TABLE `course_role` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`permissions` text,
	`assigned_by` text,
	`assigned_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `course_role_courseId_idx` ON `course_role` (`course_id`);--> statement-breakpoint
CREATE INDEX `course_role_userId_idx` ON `course_role` (`user_id`);--> statement-breakpoint
CREATE INDEX `course_role_course_user_idx` ON `course_role` (`course_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`campaign` text,
	`email` text,
	`created_by` text NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`used_by` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`course_id` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_code_unique` ON `invite` (`code`);--> statement-breakpoint
CREATE TABLE `course_interactive_learning` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`interactive_learning_id` text NOT NULL,
	`order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_interactive_learning_courseId_idx` ON `course_interactive_learning` (`course_id`);--> statement-breakpoint
CREATE INDEX `course_interactive_learning_id_idx` ON `course_interactive_learning` (`interactive_learning_id`);--> statement-breakpoint
CREATE TABLE `interactive_learning` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`image` text,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'hidden' NOT NULL,
	`published_at` integer,
	`closed_at` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interactive_learning_slug_unique` ON `interactive_learning` (`slug`);--> statement-breakpoint
CREATE INDEX `interactive_learning_slug_idx` ON `interactive_learning` (`slug`);--> statement-breakpoint
CREATE INDEX `interactive_learning_status_idx` ON `interactive_learning` (`status`);--> statement-breakpoint
CREATE TABLE `interactive_learning_chat` (
	`id` text PRIMARY KEY NOT NULL,
	`llm_role` text,
	`llm_instructions` text,
	`llm_context` text,
	`system_prompt` text,
	`llm_model` text,
	`temperature` real,
	`max_tokens` integer,
	`top_p` real,
	`created_at` integer NOT NULL,
	`metadata` text,
	`rag_enabled` integer DEFAULT false,
	`rag_collection_name` text,
	`rag_chunk_size` integer DEFAULT 1000,
	`rag_chunk_overlap` integer DEFAULT 200,
	`rag_top_k` integer DEFAULT 5,
	`rag_min_score` real DEFAULT 0.7,
	`rag_system_prompt_template` text,
	FOREIGN KEY (`id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `interactive_learning_chat_file` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_chat_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`interactive_learning_chat_id`) REFERENCES `interactive_learning_chat`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `interactive_learning_chat_file_idx` ON `interactive_learning_chat_file` (`interactive_learning_chat_id`);--> statement-breakpoint
CREATE TABLE `interactive_learning_chat_rag_document` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_chat_id` text NOT NULL,
	`name` text NOT NULL,
	`original_path` text,
	`file_type` text NOT NULL,
	`file_size` integer,
	`chunk_count` integer DEFAULT 0,
	`total_characters` integer DEFAULT 0,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`qdrant_point_ids` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`interactive_learning_chat_id`) REFERENCES `interactive_learning_chat`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interactive_learning_chat_rag_document_chat_idx` ON `interactive_learning_chat_rag_document` (`interactive_learning_chat_id`);--> statement-breakpoint
CREATE INDEX `interactive_learning_chat_rag_document_status_idx` ON `interactive_learning_chat_rag_document` (`status`);--> statement-breakpoint
CREATE TABLE `user_interactive_learning_chat` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`interactive_learning_chat_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interactive_learning_chat_id`) REFERENCES `interactive_learning_chat`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_interactive_learning_chat_userId_idx` ON `user_interactive_learning_chat` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_interactive_learning_chat_ilChatId_idx` ON `user_interactive_learning_chat` (`interactive_learning_chat_id`);--> statement-breakpoint
CREATE TABLE `ai_model` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`capabilities` text,
	`context_window` integer,
	`max_output_tokens` integer,
	`input_price_per_million` real,
	`output_price_per_million` real,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `ai_provider`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_model_name_unique` ON `ai_model` (`name`);--> statement-breakpoint
CREATE INDEX `ai_model_providerId_idx` ON `ai_model` (`provider_id`);--> statement-breakpoint
CREATE INDEX `ai_model_isActive_idx` ON `ai_model` (`is_active`);--> statement-breakpoint
CREATE TABLE `ai_provider` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text,
	`api_key` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_provider_name_unique` ON `ai_provider` (`name`);--> statement-breakpoint
CREATE TABLE `ai_quota` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`target_id` text,
	`model_id` text,
	`period` text DEFAULT 'monthly' NOT NULL,
	`max_tokens` integer,
	`max_requests` integer,
	`max_cost` real,
	`current_tokens` integer DEFAULT 0 NOT NULL,
	`current_requests` integer DEFAULT 0 NOT NULL,
	`current_cost` real DEFAULT 0 NOT NULL,
	`period_started_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `ai_model`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_quota_type_idx` ON `ai_quota` (`type`);--> statement-breakpoint
CREATE INDEX `ai_quota_targetId_idx` ON `ai_quota` (`target_id`);--> statement-breakpoint
CREATE INDEX `ai_quota_modelId_idx` ON `ai_quota` (`model_id`);--> statement-breakpoint
CREATE TABLE `ai_usage_daily_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`model_id` text NOT NULL,
	`total_requests` integer DEFAULT 0 NOT NULL,
	`successful_requests` integer DEFAULT 0 NOT NULL,
	`failed_requests` integer DEFAULT 0 NOT NULL,
	`total_input_tokens` integer DEFAULT 0 NOT NULL,
	`total_output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`total_cost` real DEFAULT 0 NOT NULL,
	`avg_duration_ms` integer DEFAULT 0 NOT NULL,
	`unique_users` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `ai_model`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_usage_daily_stats_date_idx` ON `ai_usage_daily_stats` (`date`);--> statement-breakpoint
CREATE INDEX `ai_usage_daily_stats_modelId_idx` ON `ai_usage_daily_stats` (`model_id`);--> statement-breakpoint
CREATE INDEX `ai_usage_daily_stats_date_model_idx` ON `ai_usage_daily_stats` (`date`,`model_id`);--> statement-breakpoint
CREATE TABLE `ai_usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`user_id` text,
	`course_id` text,
	`interactive_learning_id` text,
	`chat_id` text,
	`operation` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real DEFAULT 0,
	`duration_ms` integer,
	`success` integer DEFAULT true NOT NULL,
	`error_message` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `ai_model`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_usage_log_modelId_idx` ON `ai_usage_log` (`model_id`);--> statement-breakpoint
CREATE INDEX `ai_usage_log_userId_idx` ON `ai_usage_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_usage_log_courseId_idx` ON `ai_usage_log` (`course_id`);--> statement-breakpoint
CREATE INDEX `ai_usage_log_createdAt_idx` ON `ai_usage_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_log_interactiveLearningId_idx` ON `ai_usage_log` (`interactive_learning_id`);--> statement-breakpoint
CREATE TABLE `analytics_daily_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`unique_visitors` integer DEFAULT 0 NOT NULL,
	`unique_users` integer DEFAULT 0 NOT NULL,
	`total_sessions` integer DEFAULT 0 NOT NULL,
	`total_page_views` integer DEFAULT 0 NOT NULL,
	`avg_session_duration` integer DEFAULT 0 NOT NULL,
	`bounce_rate` real DEFAULT 0 NOT NULL,
	`top_pages` text,
	`top_referrers` text,
	`device_breakdown` text,
	`browser_breakdown` text,
	`new_vs_returning` text,
	`hourly_activity` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_daily_stats_date_unique` ON `analytics_daily_stats` (`date`);--> statement-breakpoint
CREATE INDEX `analytics_daily_stats_date_idx` ON `analytics_daily_stats` (`date`);--> statement-breakpoint
CREATE TABLE `analytics_event` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`visitor_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`path` text,
	`title` text,
	`referrer` text,
	`duration` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `analytics_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `analytics_event_sessionId_idx` ON `analytics_event` (`session_id`);--> statement-breakpoint
CREATE INDEX `analytics_event_visitorId_idx` ON `analytics_event` (`visitor_id`);--> statement-breakpoint
CREATE INDEX `analytics_event_userId_idx` ON `analytics_event` (`user_id`);--> statement-breakpoint
CREATE INDEX `analytics_event_type_idx` ON `analytics_event` (`type`);--> statement-breakpoint
CREATE INDEX `analytics_event_createdAt_idx` ON `analytics_event` (`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_event_path_idx` ON `analytics_event` (`path`);--> statement-breakpoint
CREATE TABLE `analytics_session` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`user_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration` integer,
	`page_views` integer DEFAULT 0 NOT NULL,
	`device` text,
	`browser` text,
	`os` text,
	`screen_resolution` text,
	`language` text,
	`referrer` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`country` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `analytics_session_visitorId_idx` ON `analytics_session` (`visitor_id`);--> statement-breakpoint
CREATE INDEX `analytics_session_userId_idx` ON `analytics_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `analytics_session_startedAt_idx` ON `analytics_session` (`started_at`);--> statement-breakpoint
CREATE INDEX `analytics_session_isActive_idx` ON `analytics_session` (`is_active`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`course_id` text,
	`activity_id` text,
	`metadata` text,
	`read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`channels` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notification_userId_idx` ON `notification` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_read_idx` ON `notification` (`user_id`,`read`);--> statement-breakpoint
CREATE INDEX `notification_createdAt_idx` ON `notification` (`created_at`);--> statement-breakpoint
CREATE TABLE `activity_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`interactive_learning_id` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`score` integer,
	`time_spent` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`last_interaction_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_progress_userId_idx` ON `activity_progress` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_progress_courseId_idx` ON `activity_progress` (`course_id`);--> statement-breakpoint
CREATE INDEX `activity_progress_interactiveId_idx` ON `activity_progress` (`interactive_learning_id`);--> statement-breakpoint
CREATE TABLE `student_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`last_accessed_at` integer NOT NULL,
	`completed_activities` integer DEFAULT 0 NOT NULL,
	`total_time_spent` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `student_progress_userId_idx` ON `student_progress` (`user_id`);--> statement-breakpoint
CREATE INDEX `student_progress_courseId_idx` ON `student_progress` (`course_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`action` text NOT NULL,
	`user_id` text,
	`target_type` text,
	`target_id` text,
	`details` text,
	`ip_address` text,
	`user_agent` text,
	`severity` text DEFAULT 'info',
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_timestamp_idx` ON `audit_log` (`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_log_action_idx` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `audit_log_userId_idx` ON `audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_log_severity_idx` ON `audit_log` (`severity`);--> statement-breakpoint
CREATE TABLE `app_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_setting_key_unique` ON `app_setting` (`key`);