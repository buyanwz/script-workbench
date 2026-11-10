ALTER TABLE `projects` ADD COLUMN `outline_overlap_rate` integer;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `outline_overlap_fragments_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `outline_overlap_outline` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `outline_overlap_mode_id` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `outline_overlap_mode_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `outline_overlap_computed_at` integer;
