-- Create asset_images table
CREATE TABLE `asset_images` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`prompt` text,
	`storage_path` text NOT NULL,
	`mime_type` text,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
-- Migrate existing images from assets to asset_images
INSERT INTO `asset_images` (`id`, `asset_id`, `prompt`, `storage_path`, `mime_type`, `width`, `height`, `file_size`, `created_at`)
SELECT 
  `id` || '-img-1',
  `id`,
  `prompt`,
  `storage_path`,
  `mime_type`,
  `width`,
  `height`,
  `file_size`,
  `created_at`
FROM `assets`
WHERE `storage_path` IS NOT NULL AND `storage_path` != '';

--> statement-breakpoint
-- Drop old columns from assets (SQLite requires table recreation)
CREATE TABLE `assets_new` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`type` text DEFAULT 'image' NOT NULL,
	`name` text NOT NULL,
	`messages` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
INSERT INTO `assets_new` (`id`, `project_id`, `type`, `name`, `messages`, `created_at`, `updated_at`)
SELECT `id`, `project_id`, `type`, `name`, `messages`, `created_at`, `updated_at`
FROM `assets`;

--> statement-breakpoint
DROP TABLE `assets`;

--> statement-breakpoint
ALTER TABLE `assets_new` RENAME TO `assets`;
