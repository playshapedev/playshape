ALTER TABLE `activities` ADD `template_id` text NOT NULL REFERENCES templates(id);--> statement-breakpoint
ALTER TABLE `activities` ADD `data` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `messages` text;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `type`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `definition`;