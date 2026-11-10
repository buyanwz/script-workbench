CREATE TABLE `monitor_cleanup_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text DEFAULT '' NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`video_id` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`creator_name` text DEFAULT '' NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`deleted_at` integer NOT NULL
);
