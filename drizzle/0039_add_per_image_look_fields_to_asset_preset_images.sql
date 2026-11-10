ALTER TABLE `asset_preset_images` ADD COLUMN `look` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_preset_images` ADD COLUMN `pending_look` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_preset_images` ADD COLUMN `pending_job_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_preset_images` ADD COLUMN `pending_updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_preset_images` ADD COLUMN `pending_rollback` text DEFAULT '' NOT NULL;
