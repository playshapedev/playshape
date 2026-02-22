ALTER TABLE `documents` ADD `messages` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `content_last_read_at` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `content_last_modified_at` integer;