CREATE TABLE `scene_asset_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL REFERENCES `projects`(`id`),
	`name` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`prompt_zh` text DEFAULT '' NOT NULL,
	`prompt_en` text DEFAULT '' NOT NULL,
	`image_blob_key` text,
	`image_mime` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `image_gen_records` ADD COLUMN `scene_asset_id` integer;
--> statement-breakpoint
ALTER TABLE `image_gen_records` ADD COLUMN `scene_asset_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `image_gen_records` ADD COLUMN `saved_scene_asset_id` integer;
--> statement-breakpoint
ALTER TABLE `image_gen_records` ADD COLUMN `saved_scene_asset_name` text DEFAULT '' NOT NULL;
