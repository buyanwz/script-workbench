CREATE TABLE `cover_analysis_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL REFERENCES `projects`(`id`),
	`style_id` text DEFAULT '' NOT NULL,
	`ratio` text DEFAULT '3:4' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`stage` text DEFAULT 'main' NOT NULL,
	`plan_json` text DEFAULT '' NOT NULL,
	`result_json` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`step_started_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
