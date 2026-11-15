ALTER TABLE `monitor_accounts` ADD COLUMN `auto_update` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `monitor_accounts` ADD COLUMN `last_collected_at` integer;
--> statement-breakpoint
ALTER TABLE `monitor_accounts` ADD COLUMN `last_collect_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `monitor_videos` ADD COLUMN `is_pinned` integer;
--> statement-breakpoint
INSERT OR IGNORE INTO `monitor_meta` (`key`, `value`) VALUES ('monitor_auto_update_enabled', '0');
--> statement-breakpoint
INSERT OR IGNORE INTO `monitor_meta` (`key`, `value`) VALUES ('monitor_auto_update_interval_hours', '24');
