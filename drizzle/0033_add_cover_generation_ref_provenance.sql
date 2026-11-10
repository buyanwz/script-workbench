ALTER TABLE `cover_generations` ADD COLUMN `ref_count` integer;
--> statement-breakpoint
ALTER TABLE `cover_generations` ADD COLUMN `ref_char_ids` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `cover_generations` ADD COLUMN `ref_host_hashes` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `cover_generations` ADD COLUMN `degrade_reason` text;
