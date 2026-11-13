ALTER TABLE `asset_presets` ADD COLUMN `parent_preset_id` integer;
--> statement-breakpoint
ALTER TABLE `asset_preset_images` ADD COLUMN `source_preset_id` integer;
