CREATE TABLE `token_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`provider_id` text,
	`model_id` text NOT NULL,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`was_compacted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
