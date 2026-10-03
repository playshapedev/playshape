CREATE TABLE `activity_skills` (
	`activity_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	PRIMARY KEY(`activity_id`, `skill_id`),
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_skills_skill_id_idx` ON `activity_skills` (`skill_id`);--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_id` text NOT NULL,
	`statement` text NOT NULL,
	`conditions` text,
	`criteria` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `skills` ADD `sort_order` integer DEFAULT 0 NOT NULL;