CREATE TABLE `monitor_deleted_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_url` text DEFAULT '' NOT NULL,
	`video_id` text DEFAULT '' NOT NULL,
	`video_url` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_deleted_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_url` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
