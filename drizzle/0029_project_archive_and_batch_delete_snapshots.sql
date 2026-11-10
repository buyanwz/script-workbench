ALTER TABLE `projects` ADD COLUMN `archived` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `archive_category` text DEFAULT '暂时不用' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `stars` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `archived_at` integer;
--> statement-breakpoint
CREATE TABLE `project_archive_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_archive_categories_name_unique` ON `project_archive_categories` (`name`);
--> statement-breakpoint
CREATE TABLE `project_delete_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_name` text DEFAULT '' NOT NULL,
	`payload_json` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
