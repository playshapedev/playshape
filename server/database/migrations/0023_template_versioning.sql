CREATE TABLE `template_migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`from_version` integer NOT NULL,
	`to_version` integer NOT NULL,
	`migration_fn` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `template_pending_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`input_schema` text,
	`component` text,
	`sample_data` text,
	`dependencies` text,
	`tools` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`input_schema` text,
	`component` text,
	`sample_data` text,
	`dependencies` text,
	`tools` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `data_schema_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `chat_schema_version` integer;--> statement-breakpoint
ALTER TABLE `templates` ADD `schema_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Create v1 snapshots for all existing templates
INSERT INTO `template_versions` (`id`, `template_id`, `version`, `input_schema`, `component`, `sample_data`, `dependencies`, `tools`, `created_at`)
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) as id,
  `id` as template_id,
  1 as version,
  `input_schema`,
  `component`,
  `sample_data`,
  `dependencies`,
  `tools`,
  `created_at`
FROM `templates`;