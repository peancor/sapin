PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_interactive_learning_chat` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`interactive_learning_chat_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interactive_learning_chat_id`) REFERENCES `interactive_learning`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_user_interactive_learning_chat`("id", "user_id", "interactive_learning_chat_id", "chat_id", "created_at") SELECT "id", "user_id", "interactive_learning_chat_id", "chat_id", "created_at" FROM `user_interactive_learning_chat`;--> statement-breakpoint
DROP TABLE `user_interactive_learning_chat`;--> statement-breakpoint
ALTER TABLE `__new_user_interactive_learning_chat` RENAME TO `user_interactive_learning_chat`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `user_interactive_learning_chat_userId_idx` ON `user_interactive_learning_chat` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_interactive_learning_chat_ilChatId_idx` ON `user_interactive_learning_chat` (`interactive_learning_chat_id`);