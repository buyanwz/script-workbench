CREATE TABLE `monitor_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text DEFAULT '快手' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
