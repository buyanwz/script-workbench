CREATE TABLE `project_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL REFERENCES `projects`(`id`),
	`version_no` integer DEFAULT 1 NOT NULL,
	`script_json` text NOT NULL,
	`stage` text DEFAULT 'review' NOT NULL,
	`lens_count` integer DEFAULT 0 NOT NULL,
	`total_seconds` real DEFAULT 0 NOT NULL,
	`auto_note` text DEFAULT '' NOT NULL,
	`user_note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
