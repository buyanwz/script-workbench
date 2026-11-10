CREATE TABLE `monitor_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `monitor_accounts` ADD COLUMN `group_id` integer REFERENCES `monitor_groups`(`id`);
