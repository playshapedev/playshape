CREATE TABLE `chat_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text,
	`template_id` text,
	`message_id` text NOT NULL,
	`storage_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`filename` text,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
