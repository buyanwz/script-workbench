ALTER TABLE `video_analyses` ADD COLUMN `video_file_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `video_analyses` ADD COLUMN `description` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `video_analyses` ADD COLUMN `dissection_json` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `video_analyses` ADD COLUMN `applied_project_id` integer;
