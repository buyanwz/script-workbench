// blob 文件系统实现（P2）— 替代 P1 的内存占位 blob。
//
// 落盘规则：key 按前缀分目录落在 <dataDir>/blobs/ 下，例如
// `char/1/2-1730000000000` → blobs/char/1/2-1730000000000，
// `thumb/char/1/…` → blobs/thumb/char/1/…。sidecar 元数据文件与
// blob 文件同名加 `.meta.json` 后缀（list() 绝不把它当 blob 返回）。
//   - put：原子写（先写同目录临时文件再 rename），etag = 内容 SHA-256；
//     覆盖写时保留原 createdAtMs。
//   - head：读 sidecar；sidecar 缺失（外来文件）时按文件 stat + 现算
//     SHA-256 合成元数据。
//   - getUrl：与 P1 一致，同源 `/blobs/<key>`（key 整体 encodeURIComponent）。
//   - delete：删文件 + sidecar；不存在也不报错。
//   - list(prefix)：递归扫 blobs/，只返回带 sidecar 或真实存在的文件，
//     临时文件（.tmp-*）与 sidecar（*.meta.json）不返回。
//   - readBlobFile(key)：供 server.ts 的 GET /blobs/:key 直出磁盘文件
//     （含 Range），返回 { path, contentType, size, etag } 或 null。
//
// 安全：key 拒绝目录穿越（.. 段、绝对路径、反斜杠、空段、NUL），
// `.meta.json` 后缀为 sidecar 保留、拒绝作为 blob key。

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import type { BlobClient, BlobMetadata, BlobPutOptions } from "./local-sdk";

const META_SUFFIX = ".meta.json";
const TMP_PREFIX = ".tmp-";

export interface BlobFile {
  readonly path: string;
  readonly contentType: string;
  readonly size: number;
  readonly etag: string;
}

interface StoredMeta {
  contentType: string;
  size: number;
  etag: string;
  createdAtMs: number;
  updatedAtMs: number;
}

const EXT_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function contentTypeFor(key: string, fallback: string): string {
  return EXT_CONTENT_TYPES[extname(key).toLowerCase()] ?? fallback;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function toBytes(
  data: string | ArrayBuffer | ArrayBufferView | Blob,
): Promise<Uint8Array> {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** 校验 key，返回它在 blobsDir 下的绝对路径；不合法返回 null。 */
function resolveBlobPath(blobsDir: string, key: string): string | null {
  if (!key || key.includes("\\") || key.includes("\0")) return null;
  if (key.startsWith("/") || key.endsWith(META_SUFFIX)) return null;
  const parts = key.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  const full = resolve(blobsDir, ...parts);
  if (full !== blobsDir && !full.startsWith(blobsDir + sep)) return null;
  return full;
}

function metaPath(filePath: string): string {
  return `${filePath}${META_SUFFIX}`;
}

function readMeta(filePath: string, size: number): StoredMeta | null {
  try {
    const raw = readFileSync(metaPath(filePath), "utf-8");
    const m = JSON.parse(raw) as Partial<StoredMeta>;
    if (
      typeof m.contentType !== "string" ||
      typeof m.etag !== "string" ||
      typeof m.createdAtMs !== "number" ||
      typeof m.updatedAtMs !== "number"
    ) {
      return null;
    }
    return {
      contentType: m.contentType,
      size: typeof m.size === "number" ? m.size : size,
      etag: m.etag,
      createdAtMs: m.createdAtMs,
      updatedAtMs: m.updatedAtMs,
    };
  } catch {
    return null;
  }
}

/** 原子写：同目录临时文件 → rename（同文件系统内 rename 是原子的）。 */
function writeFileAtomic(filePath: string, bytes: Uint8Array): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = join(
    dirname(filePath),
    `${TMP_PREFIX}${process.pid}-${randomBytes(8).toString("hex")}`,
  );
  try {
    writeFileSync(tmp, bytes);
    renameSync(tmp, filePath);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // 清临时文件失败不掩盖原始写错误。
    }
    throw e;
  }
}

function metaOf(key: string, m: StoredMeta): BlobMetadata {
  return {
    key,
    contentType: m.contentType,
    size: m.size,
    sizeBytes: m.size,
    etag: m.etag,
    visibility: "private",
    createdAtMs: m.createdAtMs,
    updatedAtMs: m.updatedAtMs,
    public: false,
  };
}

export function createFsBlobClient(blobsDir: string): BlobClient {
  return {
    async put(key, data, options?: BlobPutOptions) {
      const filePath = resolveBlobPath(blobsDir, key);
      if (!filePath) throw new Error(`blob key 不合法（拒绝目录穿越或保留后缀）：${key}`);
      const bytes = await toBytes(data);
      const now = Date.now();
      let createdAtMs = now;
      try {
        const st = statSync(filePath);
        const prev = readMeta(filePath, st.size);
        if (prev) createdAtMs = prev.createdAtMs;
      } catch {
        // 新文件，createdAtMs 即 now。
      }
      const etag = sha256Hex(bytes);
      writeFileAtomic(filePath, bytes);
      const meta: StoredMeta = {
        contentType: options?.contentType ?? contentTypeFor(key, "application/octet-stream"),
        size: bytes.byteLength,
        etag,
        createdAtMs,
        updatedAtMs: now,
      };
      writeFileAtomic(metaPath(filePath), new TextEncoder().encode(JSON.stringify(meta)));
    },

    async getUrl(key) {
      const filePath = resolveBlobPath(blobsDir, key);
      if (!filePath || !existsSync(filePath)) throw new Error(`blob 不存在：${key}`);
      return `/blobs/${encodeURIComponent(key)}`;
    },

    async delete(key) {
      const filePath = resolveBlobPath(blobsDir, key);
      if (!filePath) return;
      rmSync(filePath, { force: true });
      rmSync(metaPath(filePath), { force: true });
    },

    async head(key) {
      const filePath = resolveBlobPath(blobsDir, key);
      if (!filePath) return null;
      let st;
      try {
        st = statSync(filePath);
      } catch {
        return null;
      }
      if (!st.isFile()) return null;
      const meta = readMeta(filePath, st.size);
      if (meta) return metaOf(key, meta);
      const bytes = readFileSync(filePath);
      return metaOf(key, {
        contentType: contentTypeFor(key, "application/octet-stream"),
        size: st.size,
        etag: sha256Hex(bytes),
        createdAtMs: st.birthtimeMs,
        updatedAtMs: st.mtimeMs,
      });
    },

    async list(prefix = "") {
      const out: BlobMetadata[] = [];
      const walk = (dir: string): void => {
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile()) {
            if (entry.name.startsWith(TMP_PREFIX)) continue;
            if (entry.name.endsWith(META_SUFFIX)) continue;
            const key = relative(blobsDir, full).split(sep).join("/");
            if (!key.startsWith(prefix)) continue;
            let st;
            try {
              st = statSync(full);
            } catch {
              continue;
            }
            const meta = readMeta(full, st.size);
            if (meta) {
              out.push(metaOf(key, meta));
            } else {
              out.push(
                metaOf(key, {
                  contentType: contentTypeFor(key, "application/octet-stream"),
                  size: st.size,
                  etag: sha256Hex(readFileSync(full)),
                  createdAtMs: st.birthtimeMs,
                  updatedAtMs: st.mtimeMs,
                }),
              );
            }
          }
        }
      };
      walk(blobsDir);
      return out;
    },
  };
}

// --- 模块级单例：initDataLayer 后由 ctx.ts / server.ts 共用 -------------

let blobsDirSingleton: string | null = null;
let clientSingleton: BlobClient | null = null;

/** 数据层初始化后调一次，锁定 blobs 根目录并建好客户端单例。 */
export function initFsBlobs(blobsDir: string): BlobClient {
  blobsDirSingleton = blobsDir;
  clientSingleton = createFsBlobClient(blobsDir);
  return clientSingleton;
}

/** 取文件系统 blob 客户端；未初始化时抛明错。 */
export function getFsBlobClient(): BlobClient {
  if (!clientSingleton) {
    throw new Error("blob 文件系统尚未初始化（P2 缺陷：server.ts 应在监听前先调 initDataLayer）。");
  }
  return clientSingleton;
}

/**
 * 供 server.ts 的 GET /blobs/:key 直出磁盘文件。
 * key 不合法或文件不存在返回 null；否则返回磁盘路径与响应头要用的元数据。
 */
export function readBlobFile(key: string): BlobFile | null {
  if (!blobsDirSingleton) return null;
  const filePath = resolveBlobPath(blobsDirSingleton, key);
  if (!filePath) return null;
  let st;
  try {
    st = statSync(filePath);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const meta = readMeta(filePath, st.size);
  if (meta) {
    return { path: filePath, contentType: meta.contentType, size: meta.size, etag: meta.etag };
  }
  const bytes = readFileSync(filePath);
  return {
    path: filePath,
    contentType: contentTypeFor(key, "application/octet-stream"),
    size: st.size,
    etag: sha256Hex(bytes),
  };
}

/** 仅供测试/诊断：当前 blobs 根目录（未初始化时为 null）。 */
export function getBlobsDirForTest(): string | null {
  return blobsDirSingleton;
}
