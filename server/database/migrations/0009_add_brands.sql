CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`primary_color` text DEFAULT '#7458f5' NOT NULL,
	`neutral_color` text DEFAULT '#64748b' NOT NULL,
	`accent_color` text DEFAULT '#3b82f6' NOT NULL,
	`font_family` text DEFAULT 'Poppins' NOT NULL,
	`font_source` text DEFAULT 'google' NOT NULL,
	`base_font_size` integer DEFAULT 16 NOT NULL,
	`type_scale_ratio` text DEFAULT '1.25' NOT NULL,
	`border_radius` text DEFAULT '0.325' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
