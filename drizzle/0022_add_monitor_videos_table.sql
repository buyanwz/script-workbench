ALTER TABLE `monitor_accounts` ADD COLUMN `creator_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `monitor_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL REFERENCES `monitor_accounts`(`id`),
	`video_id` text DEFAULT '' NOT NULL,
	`video_url` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cover_url` text DEFAULT '' NOT NULL,
	`video_file_url` text DEFAULT '' NOT NULL,
	`duration_text` text DEFAULT '' NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
