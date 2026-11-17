CREATE TABLE `dissect_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text,
	`name` text DEFAULT '' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '自定义预设' NOT NULL,
	`kind` text DEFAULT 'custom' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dissect_presets_slug_unique` ON `dissect_presets` (`slug`);
