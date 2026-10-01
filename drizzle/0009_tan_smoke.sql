ALTER TABLE `interactive_learning_agent` ADD `finalization_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `interactive_learning_agent` ADD `finalization_tool_name` text DEFAULT 'finalize_activity' NOT NULL;--> statement-breakpoint
ALTER TABLE `interactive_learning_agent` ADD `finalization_handler` text DEFAULT 'mark_complete_and_notify' NOT NULL;--> statement-breakpoint
ALTER TABLE `interactive_learning_agent` ADD `finalization_config` text;--> statement-breakpoint
ALTER TABLE `interactive_learning_agent` ADD `require_finalization_tool_call` integer DEFAULT true NOT NULL;
