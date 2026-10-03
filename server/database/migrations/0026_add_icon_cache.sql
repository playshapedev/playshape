CREATE TABLE `icon_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`name` text NOT NULL,
	`svg` text NOT NULL,
	`fetched_at` integer NOT NULL
);
