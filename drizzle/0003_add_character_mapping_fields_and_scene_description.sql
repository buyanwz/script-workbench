ALTER TABLE characters ADD COLUMN look TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE characters ADD COLUMN voice TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE characters ADD COLUMN tone TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE scene_images ADD COLUMN description TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE scene_images ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
