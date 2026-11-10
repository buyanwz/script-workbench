CREATE TABLE `cover_prompt_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL REFERENCES `projects`(`id`),
	`style_id` text DEFAULT '' NOT NULL,
	`prompt_zh` text DEFAULT '' NOT NULL,
	`prompt_en` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
