ALTER TABLE `projects` ADD COLUMN `selected_mode_id` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `modes` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`icon_slot` text DEFAULT '' NOT NULL,
	`style_tags` text DEFAULT '[]' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`stability` text DEFAULT '' NOT NULL,
	`status_override` text DEFAULT '' NOT NULL,
	`current_style_card_id` integer,
	`last_trained_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `style_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode_id` integer NOT NULL,
	`theme_style` text DEFAULT '' NOT NULL,
	`rhythm_style` text DEFAULT '' NOT NULL,
	`dialogue_style` text DEFAULT '' NOT NULL,
	`pixel_style` text DEFAULT '' NOT NULL,
	`added_tags` text DEFAULT '[]' NOT NULL,
	`corrected_tags` text DEFAULT '[]' NOT NULL,
	`stability` text DEFAULT '低' NOT NULL,
	`source_video` text DEFAULT '' NOT NULL,
	`confirmed` text DEFAULT 'pending' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`mode_id`) REFERENCES `modes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `training_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode_id` integer NOT NULL,
	`kind` text DEFAULT 'training' NOT NULL,
	`video_name` text DEFAULT '' NOT NULL,
	`video_type` text DEFAULT '' NOT NULL,
	`video_size_bytes` integer DEFAULT 0 NOT NULL,
	`video_duration_sec` real DEFAULT 0 NOT NULL,
	`hints_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`analysis_summary` text DEFAULT '' NOT NULL,
	`conflict` integer DEFAULT 0 NOT NULL,
	`style_card_before` text DEFAULT '' NOT NULL,
	`style_card_after` text DEFAULT '' NOT NULL,
	`progress_before` integer DEFAULT 0 NOT NULL,
	`progress_after` integer DEFAULT 0 NOT NULL,
	`stability_before` text DEFAULT '' NOT NULL,
	`stability_after` text DEFAULT '' NOT NULL,
	`revocable` integer DEFAULT 1 NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mode_id`) REFERENCES `modes`(`id`) ON UPDATE no action ON DELETE no action
);
