// 数据层（P2）— 数据目录解析、SQLite 连接、启动迁移。
//
// 数据目录解析优先级（见 port-plan.md D3）：
//   1. 环境变量 DATA_DIR（非空才算；Electron 传空串时视为未设）；
//   2. Windows 默认 %APPDATA%\ScriptWorkbench；
//   3. Linux/macOS 回落：$XDG_DATA_HOME/ScriptWorkbench（未设时为
//      $HOME/.local/share/ScriptWorkbench）。
// 目录结构（首次启动创建）：
//   <dataDir>/app.db            SQLite 库（含 -wal / -shm）
//   <dataDir>/blobs/            图片/视频 blob（按 key 前缀分目录，见 blobs-fs.ts）
//   <dataDir>/video-cloud/      云端视频与转写（videos/、state.json、queue.json、asr/，P5 用）
//   <dataDir>/logs/             服务日志（P6 的 Electron 退出/崩溃日志落这里）
//
// 迁移：启动时按 drizzle/meta/_journal.json 的 idx 顺序执行 40 个迁移，
// 每个迁移文件按 `--> statement-breakpoint` 切分逐段执行；已执行过的
// 记在自建跟踪表 __port_migrations（idx + tag + applied_at）里跳过。
// 任一迁移失败即抛错，server.ts 接到后直接停服（不监听端口、不建半截库）。
// 迁移文件本身（drizzle/*.sql）一字未动。

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { getTableName } from "drizzle-orm";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as schema from "./schema";

export type PortDb = BunSQLiteDatabase<typeof schema>;

export const MIGRATION_TRACKING_TABLE = "__port_migrations";

export interface DataLayer {
  readonly dataDir: string;
  readonly dbPath: string;
  readonly blobsDir: string;
  readonly videoCloudDir: string;
  readonly logsDir: string;
  readonly sqlite: Database;
  readonly db: PortDb;
}

/** 数据目录解析（见文件头优先级说明）。空串 DATA_DIR 视为未设。 */
export function resolveDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA?.trim() ||
      join(homedir(), "AppData", "Roaming");
    return join(appData, "ScriptWorkbench");
  }
  const xdg = process.env.XDG_DATA_HOME?.trim();
  if (xdg) return join(resolve(xdg), "ScriptWorkbench");
  return join(homedir(), ".local", "share", "ScriptWorkbench");
}

/** 找 drizzle 迁移目录：开发期源码树为主，打包后 exe 旁边的 drizzle 次之。 */
function resolveDrizzleDir(): string {
  const candidates = [
    process.env.DRIZZLE_DIR?.trim(),
    join(dirname(process.execPath), "drizzle"),
    join(process.cwd(), "drizzle"),
    join(import.meta.dir, "..", "..", "drizzle"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  for (const dir of candidates) {
    if (existsSync(join(dir, "meta", "_journal.json"))) return dir;
  }
  throw new Error(
    `找不到 drizzle 迁移目录（按 _journal.json 找过：${candidates.join("、")}）。` +
      `开发期请确认工程根下有 drizzle/；打包后请把 drizzle/ 放在服务端 exe 旁边，或设 DRIZZLE_DIR 环境变量。`,
  );
}

type JournalEntry = { idx: number; tag: string; breakpoints: boolean };

function readJournal(drizzleDir: string): JournalEntry[] {
  const raw = readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf-8");
  const parsed = JSON.parse(raw) as { entries?: JournalEntry[] };
  const entries = [...(parsed.entries ?? [])].sort((a, b) => a.idx - b.idx);
  if (entries.length === 0) {
    throw new Error("drizzle/meta/_journal.json 里没有迁移条目，无法建库，停服。");
  }
  return entries;
}

/** 执行 40 个迁移：已记入跟踪表的跳过；单个迁移包在一个事务里执行，失败即回滚并停服。 */
function runMigrations(sqlite: Database, drizzleDir: string): void {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS "${MIGRATION_TRACKING_TABLE}" (` +
      `"idx" integer PRIMARY KEY, "tag" text NOT NULL, "applied_at" integer NOT NULL)`,
  );
  const applied = new Set<number>(
    (
      sqlite
        .query(`SELECT "idx" FROM "${MIGRATION_TRACKING_TABLE}"`)
        .all() as { idx: number }[]
    ).map((r) => r.idx),
  );
  const markApplied = sqlite.query(
    `INSERT INTO "${MIGRATION_TRACKING_TABLE}" ("idx", "tag", "applied_at") VALUES (?, ?, ?)`,
  );
  for (const entry of readJournal(drizzleDir)) {
    if (applied.has(entry.idx)) continue;
    const file = join(drizzleDir, `${entry.tag}.sql`);
    let sql: string;
    try {
      sql = readFileSync(file, "utf-8");
    } catch (e) {
      throw new Error(
        `迁移 #${entry.idx}（${entry.tag}）失败：读不到迁移文件 ${file}（${e instanceof Error ? e.message : String(e)}），停服。`,
      );
    }
    const segments = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    try {
      sqlite.exec("BEGIN");
      try {
        for (const segment of segments) sqlite.exec(segment);
        markApplied.run(entry.idx, entry.tag, Date.now());
        sqlite.exec("COMMIT");
      } catch (e) {
        try {
          sqlite.exec("ROLLBACK");
        } catch {
          // 回滚本身失败也无能为力，下面抛原始迁移错误。
        }
        throw e;
      }
    } catch (e) {
      throw new Error(
        `迁移 #${entry.idx}（${entry.tag}）失败：${e instanceof Error ? e.message : String(e)}，停服（该迁移已回滚，未建半截库）。`,
      );
    }
  }
}

/** 建表后验证：schema.ts 导出的 28 张表必须全在 sqlite_master 里。 */
function verifyTables(sqlite: Database): void {
  const present = new Set<string>(
    (
      sqlite
        .query(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all() as { name: string }[]
    ).map((r) => r.name),
  );
  const missing: string[] = [];
  for (const table of Object.values(schema)) {
    const name = getTableName(table as Parameters<typeof getTableName>[0]);
    if (!present.has(name)) missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(
      `建库后表校验失败：缺 ${missing.length} 张表（${missing.join("、")}），停服。`,
    );
  }
}

let layer: DataLayer | null = null;

/**
 * 初始化数据层（server.ts 在 Bun.serve 监听之前调一次，失败即停服）。
 * 多次调用返回同一份单例（drizzle 实例与 SQLite 连接全进程唯一）。
 */
export function initDataLayer(): DataLayer {
  if (layer) return layer;
  const dataDir = resolveDataDir();
  const blobsDir = join(dataDir, "blobs");
  const videoCloudDir = join(dataDir, "video-cloud");
  const logsDir = join(dataDir, "logs");
  for (const dir of [dataDir, blobsDir, videoCloudDir, logsDir]) {
    mkdirSync(dir, { recursive: true });
  }
  const dbPath = join(dataDir, "app.db");
  const sqlite = new Database(dbPath);
  try {
    sqlite.exec("PRAGMA journal_mode=WAL;");
    runMigrations(sqlite, resolveDrizzleDir());
    verifyTables(sqlite);
  } catch (e) {
    try {
      sqlite.close();
    } catch {
      // 关闭失败不掩盖原始错误。
    }
    throw e;
  }
  const db = drizzle(sqlite, { schema });
  layer = { dataDir, dbPath, blobsDir, videoCloudDir, logsDir, sqlite, db };
  return layer;
}

/** 取已初始化的数据层；未初始化时抛明错（不应发生：server.ts 先初始化再监听）。 */
export function getDataLayer(): DataLayer {
  if (!layer) {
    throw new Error("数据层尚未初始化（P2 缺陷：server.ts 应在监听前先调 initDataLayer）。");
  }
  return layer;
}

/** 取 drizzle 单例（ctx.db 的底层实现）。 */
export function getDb(): PortDb {
  return getDataLayer().db;
}

/** 取 blob 根目录（blobs-fs.ts 与 server.ts 共用）。 */
export function getBlobsDir(): string {
  return getDataLayer().blobsDir;
}
