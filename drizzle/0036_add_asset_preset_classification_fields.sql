ALTER TABLE `asset_presets` ADD COLUMN `gender` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `age_group` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `class_uncertain` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `class_note` text DEFAULT '' NOT NULL;
