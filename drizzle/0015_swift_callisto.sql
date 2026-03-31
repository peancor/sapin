ALTER TABLE `ai_request_round` ADD `cache_read_tokens` integer;--> statement-breakpoint
ALTER TABLE `ai_request_round` ADD `cache_write_tokens` integer;--> statement-breakpoint
ALTER TABLE `ai_request_round` DROP COLUMN `cached_input_tokens`;