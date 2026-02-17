CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`type` text DEFAULT 'image' NOT NULL,
	`name` text NOT NULL,
	`prompt` text,
	`storage_path` text NOT NULL,
	`mime_type` text,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`messages` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
