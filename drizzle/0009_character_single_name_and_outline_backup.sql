ALTER TABLE `characters` ADD COLUMN `source_preset_id` integer;
--> statement-breakpoint
ALTER TABLE `characters` ADD COLUMN `source_preset_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `characters` ADD COLUMN `role_migrated` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `prev_outline` text DEFAULT '' NOT NULL;
