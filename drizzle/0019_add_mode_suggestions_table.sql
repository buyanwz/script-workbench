CREATE TABLE `mode_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode_id` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mode_id`) REFERENCES `modes`(`id`) ON UPDATE no action ON DELETE no action
);
