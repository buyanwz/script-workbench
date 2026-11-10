ALTER TABLE `projects` ADD COLUMN `source` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `projects` SET `source` = 'ai-dissect' WHERE `id` IN (SELECT `applied_project_id` FROM `video_analyses` WHERE `applied_project_id` IS NOT NULL);
