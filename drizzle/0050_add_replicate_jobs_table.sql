CREATE TABLE `replicate_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_video_id` integer DEFAULT 0 NOT NULL,
	`video_id` text DEFAULT '' NOT NULL,
	`preset_id` integer DEFAULT 1 NOT NULL,
	`instruction_text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'downloading' NOT NULL,
	`download_task_id` integer,
	`cloud_path` text DEFAULT '' NOT NULL,
	`progress_note` text DEFAULT '' NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`created_at_ms` integer DEFAULT 0 NOT NULL,
	`updated_at_ms` integer DEFAULT 0 NOT NULL,
	`download_finished_at_ms` integer,
	`dissect_started_at_ms` integer,
	`finished_at_ms` integer
);
--> statement-breakpoint
CREATE INDEX `replicate_jobs_video_id_idx` ON `replicate_jobs` (`video_id`);
--> statement-breakpoint
CREATE INDEX `replicate_jobs_download_task_id_idx` ON `replicate_jobs` (`download_task_id`);
--> statement-breakpoint
CREATE INDEX `replicate_jobs_status_idx` ON `replicate_jobs` (`status`);
