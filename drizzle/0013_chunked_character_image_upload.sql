CREATE TABLE `upload_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`upload_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`total_chunks` integer NOT NULL,
	`data_base64` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `upload_chunks_upload_id_idx` ON `upload_chunks` (`upload_id`);
