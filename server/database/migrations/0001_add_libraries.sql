-- Drop old project-scoped content tables (never had data or API)
DROP TABLE IF EXISTS `content_chunks`;
--> statement-breakpoint
DROP TABLE IF EXISTS `content`;
--> statement-breakpoint

-- Libraries: top-level knowledge containers
CREATE TABLE `libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint

-- Documents: source content within a library
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`source_filename` text,
	`mime_type` text,
	`file_size` integer,
	`body` text NOT NULL DEFAULT '',
	`status` text NOT NULL DEFAULT 'processing',
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- Document chunks: paragraph-level text for embedding and semantic search
CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`library_id` text NOT NULL,
	`text` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`embedding` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- Project-Library join table (many-to-many)
CREATE TABLE `project_libraries` (
	`project_id` text NOT NULL,
	`library_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `library_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
