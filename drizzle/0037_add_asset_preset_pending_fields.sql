ALTER TABLE `asset_presets` ADD COLUMN `pending_look` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `pending_voice` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `pending_tone` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `pending_source` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `pending_job_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `pending_updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `asset_presets` ADD COLUMN `pending_rollback` text DEFAULT '' NOT NULL;
