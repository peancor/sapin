CREATE TABLE `lti_deep_link_session` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`deployment_id` text NOT NULL,
	`teacher_user_id` text,
	`context_id` text,
	`deep_link_return_url` text NOT NULL,
	`data` text,
	`settings` text,
	`launch_claims_json` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `lti_platform_registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deployment_id`) REFERENCES `lti_deployment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teacher_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lti_deep_link_session_platform_idx` ON `lti_deep_link_session` (`platform_id`);--> statement-breakpoint
CREATE INDEX `lti_deep_link_session_expires_idx` ON `lti_deep_link_session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `lti_deployment` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`deployment_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `lti_platform_registration`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lti_deployment_platform_deployment_idx` ON `lti_deployment` (`platform_id`,`deployment_id`);--> statement-breakpoint
CREATE INDEX `lti_deployment_status_idx` ON `lti_deployment` (`status`);--> statement-breakpoint
CREATE TABLE `lti_grade_sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text,
	`deployment_id` text,
	`resource_link_db_id` text,
	`user_identity_id` text,
	`progress_id` text,
	`course_id` text,
	`activity_id` text,
	`user_id` text,
	`line_item_url` text,
	`status` text NOT NULL,
	`http_status` integer,
	`attempt` integer DEFAULT 1 NOT NULL,
	`payload_json` text,
	`response_body` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `lti_platform_registration`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deployment_id`) REFERENCES `lti_deployment`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resource_link_db_id`) REFERENCES `lti_resource_link`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_identity_id`) REFERENCES `lti_user_identity`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`progress_id`) REFERENCES `learning_activity_progress`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lti_grade_sync_course_activity_idx` ON `lti_grade_sync_log` (`course_id`,`activity_id`);--> statement-breakpoint
CREATE INDEX `lti_grade_sync_user_idx` ON `lti_grade_sync_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `lti_grade_sync_status_idx` ON `lti_grade_sync_log` (`status`);--> statement-breakpoint
CREATE INDEX `lti_grade_sync_created_idx` ON `lti_grade_sync_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `lti_launch` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`deployment_id` text NOT NULL,
	`resource_link_db_id` text,
	`user_identity_id` text,
	`user_id` text,
	`lti_sub` text NOT NULL,
	`message_type` text NOT NULL,
	`roles_json` text,
	`context_id` text,
	`resource_link_id` text,
	`claims_json` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `lti_platform_registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deployment_id`) REFERENCES `lti_deployment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_link_db_id`) REFERENCES `lti_resource_link`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_identity_id`) REFERENCES `lti_user_identity`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lti_launch_resource_idx` ON `lti_launch` (`resource_link_db_id`);--> statement-breakpoint
CREATE INDEX `lti_launch_user_idx` ON `lti_launch` (`user_id`);--> statement-breakpoint
CREATE INDEX `lti_launch_created_idx` ON `lti_launch` (`created_at`);--> statement-breakpoint
CREATE TABLE `lti_login_state` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`nonce` text NOT NULL,
	`platform_id` text NOT NULL,
	`deployment_id` text,
	`target_link_uri` text NOT NULL,
	`login_hint` text,
	`message_hint` text,
	`client_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `lti_platform_registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deployment_id`) REFERENCES `lti_deployment`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lti_login_state_state_unique` ON `lti_login_state` (`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `lti_login_state_nonce_unique` ON `lti_login_state` (`nonce`);--> statement-breakpoint
CREATE INDEX `lti_login_state_platform_idx` ON `lti_login_state` (`platform_id`);--> statement-breakpoint
CREATE INDEX `lti_login_state_expires_idx` ON `lti_login_state` (`expires_at`);--> statement-breakpoint
CREATE TABLE `lti_platform_registration` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`issuer` text NOT NULL,
	`client_id` text NOT NULL,
	`auth_login_url` text NOT NULL,
	`token_url` text NOT NULL,
	`jwks_url` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`settings` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lti_platform_issuer_client_idx` ON `lti_platform_registration` (`issuer`,`client_id`);--> statement-breakpoint
CREATE INDEX `lti_platform_status_idx` ON `lti_platform_registration` (`status`);--> statement-breakpoint
CREATE TABLE `lti_resource_link` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`deployment_id` text NOT NULL,
	`resource_link_id` text NOT NULL,
	`context_id` text NOT NULL,
	`course_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`title` text,
	`line_item_url` text,
	`line_items_url` text,
	`ags_scope` text,
	`custom_json` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `lti_platform_registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deployment_id`) REFERENCES `lti_deployment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lti_resource_link_identity_idx` ON `lti_resource_link` (`platform_id`,`deployment_id`,`context_id`,`resource_link_id`);--> statement-breakpoint
CREATE INDEX `lti_resource_link_course_activity_idx` ON `lti_resource_link` (`course_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `lti_tool_key` (
	`id` text PRIMARY KEY NOT NULL,
	`kid` text NOT NULL,
	`public_jwk` text NOT NULL,
	`private_jwk` text NOT NULL,
	`algorithm` text DEFAULT 'RS256' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`activated_at` integer NOT NULL,
	`retired_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lti_tool_key_kid_unique` ON `lti_tool_key` (`kid`);--> statement-breakpoint
CREATE INDEX `lti_tool_key_status_idx` ON `lti_tool_key` (`status`);--> statement-breakpoint
CREATE TABLE `lti_user_identity` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`deployment_id` text NOT NULL,
	`sub` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`name` text,
	`roles_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_launch_at` integer,
	FOREIGN KEY (`platform_id`) REFERENCES `lti_platform_registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deployment_id`) REFERENCES `lti_deployment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lti_user_identity_subject_idx` ON `lti_user_identity` (`platform_id`,`deployment_id`,`sub`);--> statement-breakpoint
CREATE INDEX `lti_user_identity_user_idx` ON `lti_user_identity` (`user_id`);