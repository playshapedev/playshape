CREATE TABLE `chat_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`context_type` text NOT NULL,
	`context_id` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
