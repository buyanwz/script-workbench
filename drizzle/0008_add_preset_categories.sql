ALTER TABLE `asset_presets` ADD COLUMN `category` text DEFAULT '未分类' NOT NULL;
--> statement-breakpoint
CREATE TABLE `asset_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_categories_name_unique` ON `asset_categories` (`name`);
