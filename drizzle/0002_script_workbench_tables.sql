DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '未命名项目',
  outline TEXT NOT NULL DEFAULT '',
  speech_rate INTEGER NOT NULL DEFAULT 5,
  scene_mode TEXT NOT NULL DEFAULT 'text',
  scene_text TEXT NOT NULL DEFAULT '',
  style_preset TEXT NOT NULL DEFAULT '幽默风趣',
  style_custom TEXT NOT NULL DEFAULT '',
  target_seconds INTEGER NOT NULL DEFAULT 60,
  script_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  image_blob_key TEXT,
  image_mime TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE scene_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL DEFAULT '',
  image_blob_key TEXT NOT NULL,
  image_mime TEXT NOT NULL DEFAULT 'image/jpeg',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
