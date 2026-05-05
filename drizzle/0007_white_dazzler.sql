CREATE TABLE `interactive_learning_file` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_id` text NOT NULL,
	`file_storage_id` text,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_storage_id`) REFERENCES `file_storage`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `interactive_learning_file_il_idx` ON `interactive_learning_file` (`interactive_learning_id`);--> statement-breakpoint
CREATE INDEX `interactive_learning_file_storage_idx` ON `interactive_learning_file` (`file_storage_id`);--> statement-breakpoint
CREATE TABLE `interactive_learning_rag_document` (
	`id` text PRIMARY KEY NOT NULL,
	`interactive_learning_id` text NOT NULL,
	`file_storage_id` text,
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
	FOREIGN KEY (`interactive_learning_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_storage_id`) REFERENCES `file_storage`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `interactive_learning_rag_document_il_idx` ON `interactive_learning_rag_document` (`interactive_learning_id`);--> statement-breakpoint
CREATE INDEX `interactive_learning_rag_document_status_idx` ON `interactive_learning_rag_document` (`status`);--> statement-breakpoint
CREATE INDEX `interactive_learning_rag_document_storage_idx` ON `interactive_learning_rag_document` (`file_storage_id`);