CREATE TABLE `download_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`page_url` text DEFAULT '' NOT NULL,
	`platform` text DEFAULT '' NOT NULL,
	`creator_name` text DEFAULT '' NOT NULL,
	`preset_id` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`file_size_bytes` integer,
	`duration_ms` integer,
	`sha256` text DEFAULT '' NOT NULL,
	`cloud_path` text DEFAULT '' NOT NULL,
	`created_at_ms` integer DEFAULT 0 NOT NULL,
	`updated_at_ms` integer DEFAULT 0 NOT NULL,
	`claimed_at_ms` integer,
	`done_at_ms` integer
);
--> statement-breakpoint
CREATE INDEX `download_tasks_video_id_idx` ON `download_tasks` (`video_id`);
--> statement-breakpoint
CREATE INDEX `download_tasks_status_idx` ON `download_tasks` (`status`);
