ALTER TABLE `image_gen_records` ADD COLUMN `ref_image_count` integer;
--> statement-breakpoint
ALTER TABLE `image_gen_records` ADD COLUMN `ref_sent` integer;
--> statement-breakpoint
ALTER TABLE `image_gen_records` ADD COLUMN `ref_source` text;
--> statement-breakpoint
ALTER TABLE `image_gen_records` ADD COLUMN `ref_host_hashes` text DEFAULT '' NOT NULL;
