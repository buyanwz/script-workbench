ALTER TABLE `asset_presets` ADD COLUMN `card_role` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `card_note` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `from_card` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `asset_preset_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preset_id` integer NOT NULL REFERENCES `asset_presets`(`id`),
	`file_name` text DEFAULT '' NOT NULL,
	`image_blob_key` text NOT NULL,
	`image_mime` text DEFAULT 'image/jpeg' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL
);
