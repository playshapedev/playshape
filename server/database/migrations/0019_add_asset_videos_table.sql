CREATE TABLE `asset_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`source` text NOT NULL,
	`url` text,
	`storage_path` text,
	`thumbnail_path` text,
	`mime_type` text,
	`width` integer,
	`height` integer,
	`duration` integer,
	`file_size` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
