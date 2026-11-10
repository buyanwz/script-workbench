ALTER TABLE `monitor_videos` ADD COLUMN `kuaishou_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `monitor_videos` ADD COLUMN `fans_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `monitor_videos` ADD COLUMN `total_like_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `monitor_videos` ADD COLUMN `creator_bio` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `monitor_videos` ADD COLUMN `comment_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `monitor_videos` ADD COLUMN `collected_at` integer;
