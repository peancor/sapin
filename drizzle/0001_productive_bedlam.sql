PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invite` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`campaign` text,
	`email` text,
	`config` text NOT NULL,
	`created_by` text NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`used_by` text,
	`used_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`course_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `invite`;--> statement-breakpoint
ALTER TABLE `__new_invite` RENAME TO `invite`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invite_code_unique` ON `invite` (`code`);--> statement-breakpoint
CREATE INDEX `invite_code_idx` ON `invite` (`code`);--> statement-breakpoint
CREATE INDEX `invite_courseId_idx` ON `invite` (`course_id`);--> statement-breakpoint
CREATE INDEX `invite_createdBy_idx` ON `invite` (`created_by`);