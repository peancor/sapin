CREATE TABLE `agent_message_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text,
	`file_storage_id` text NOT NULL,
	`kind` text DEFAULT 'image' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`safety_status` text DEFAULT 'not_checked' NOT NULL,
	`sequence_order` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `agent_message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_storage_id`) REFERENCES `file_storage`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_message_attachment_chat_idx` ON `agent_message_attachment` (`chat_id`);--> statement-breakpoint
CREATE INDEX `agent_message_attachment_message_idx` ON `agent_message_attachment` (`message_id`);--> statement-breakpoint
CREATE INDEX `agent_message_attachment_file_idx` ON `agent_message_attachment` (`file_storage_id`);--> statement-breakpoint
CREATE INDEX `agent_message_attachment_uploaded_by_idx` ON `agent_message_attachment` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX `agent_message_attachment_status_idx` ON `agent_message_attachment` (`status`);