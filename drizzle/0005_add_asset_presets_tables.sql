CREATE TABLE `asset_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	`person_zh` text DEFAULT '' NOT NULL,
	`person_en` text DEFAULT '' NOT NULL,
	`hair_zh` text DEFAULT '' NOT NULL,
	`hair_en` text DEFAULT '' NOT NULL,
	`hat_zh` text DEFAULT '' NOT NULL,
	`hat_en` text DEFAULT '' NOT NULL,
	`face_zh` text DEFAULT '' NOT NULL,
	`face_en` text DEFAULT '' NOT NULL,
	`neck_zh` text DEFAULT '' NOT NULL,
	`neck_en` text DEFAULT '' NOT NULL,
	`top_zh` text DEFAULT '' NOT NULL,
	`top_en` text DEFAULT '' NOT NULL,
	`arms_zh` text DEFAULT '' NOT NULL,
	`arms_en` text DEFAULT '' NOT NULL,
	`bottom_zh` text DEFAULT '' NOT NULL,
	`bottom_en` text DEFAULT '' NOT NULL,
	`shoes_zh` text DEFAULT '' NOT NULL,
	`shoes_en` text DEFAULT '' NOT NULL,
	`extra_zh` text DEFAULT '' NOT NULL,
	`extra_en` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
