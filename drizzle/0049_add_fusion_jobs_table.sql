CREATE TABLE `fusion_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode` text DEFAULT 'dual' NOT NULL,
	`style` text DEFAULT 'hyperreal' NOT NULL,
	`balance` text DEFAULT 'balanced' NOT NULL,
	`text_requirement` text DEFAULT '' NOT NULL,
	`extra_requirement` text DEFAULT '' NOT NULL,
	`images_json` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`result_json` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`step_started_at` integer,
	`dry_run` integer DEFAULT 0 NOT NULL,
	`dry_run_layout` text DEFAULT '' NOT NULL,
	`dry_run_delay_ms` integer DEFAULT 0 NOT NULL,
	`dry_run_fail` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
