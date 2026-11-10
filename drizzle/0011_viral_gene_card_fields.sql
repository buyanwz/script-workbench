ALTER TABLE `style_cards` ADD COLUMN `hook_style` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `emotion_curve` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `narrative_structure` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `interaction_design` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `viral_summary` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `weights_json` text DEFAULT '{"theme":100,"rhythm":100,"dialogue":100,"pixel":100,"hook":100,"emotion":100,"narrative":100,"interaction":100}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `adjustment_log` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `frames_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `transcript_text` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `style_cards` ADD COLUMN `rhythm_points` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `training_records` ADD COLUMN `feedback_reasons` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `training_records` ADD COLUMN `weight_changes` text DEFAULT '' NOT NULL;
