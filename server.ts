// script-workbench-port — 本地 HTTP 服务入口（P1）。
//
// 路由（单进程 Bun.serve，见 port-plan.md §保留-6）：
//   GET  /health               健康检查（Electron 主进程等它通了再开窗口）
//   POST /api/actions/:name    176 个服务端动作（Actions 对象遍历 key 自动注册）
//   GET  /blobs/:key           blob 直出（P2 走磁盘文件 + Range 支持）
//   GET  / 与前端静态资源      client/dist/ 同源托管
//   其余                     404 JSON
//
// 动作调用约定：请求体就是动作入参 JSON（与本地 fetch 客户端一致）；
// 为兼容，也接受 SDK 旧信封 `{ action, args }`。成功回 `{ ok: true, data }`，
// 失败回 `{ ok: false, error, code? }` 并带 HTTP 状态码。
// 错误状态码：入参/出参 zod 校验失败 400；未知动作 404；
// P2/P4 占位未实现 503（code 见 p1-report）；其余 handler 异常 500。
// 所有 handler 异常都在此捕获，绝不让一次动作调用打挂整个服务。

import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Actions } from "./server/src/actions";
import { createLocalCtx, NotImplementedError } from "./server/src/ctx";
import { initDataLayer } from "./server/src/db";
import { readBlobFile } from "./server/src/blobs-fs";
import type { ActionDefinition } from "./server/src/local-sdk";

// P2：先初始化数据层（建数据目录、开 SQLite、跑 40 个迁移），失败即停服，
// 不监听端口、不建半截库。数据目录口径见 server/src/db.ts。
try {
  const layer = initDataLayer();
  console.log(
    `data dir: ${layer.dataDir} (db: ${layer.dbPath}, blobs: ${layer.blobsDir})`,
  );
} catch (e) {
  console.error(`[fatal] 数据层初始化失败，停服：${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";

// 前端构建产物位置（按顺序取第一个存在 index.html 的）：
//   1. 环境变量 CLIENT_DIST（Electron 主进程显式传入，最可靠）；
//   2. 编译后 exe 旁边的 client/dist（随安装包分发：resources/client/dist）；
//   3. 开发期源码树里的 client/dist（bun server.ts，import.meta.dir 即工程根）。
// 注意：`bun build --compile` 后 import.meta.dir 指向虚拟的 /$bunfs/，
// 不能用它定位磁盘上的 dist，必须走 exe 所在目录或环境变量。
function resolveClientDist(): string {
  const candidates = [
    process.env.CLIENT_DIST,
    join(dirname(process.execPath), "client", "dist"),
    join(import.meta.dir, "client", "dist"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return candidates[candidates.length - 1] as string;
}
const CLIENT_DIST = resolveClientDist();

const actionNames = Object.keys(Actions);
const actionDefs = new Map<string, ActionDefinition>(
  Object.entries(Actions) as [string, ActionDefinition][],
);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function jsonError(status: number, error: string, code?: string): Response {
  return Response.json({ ok: false, error, ...(code ? { code } : {}) }, { status });
}

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i).toLowerCase() : "";
}

async function serveStatic(pathname: string): Promise<Response | null> {
  // 只允许 client/dist 内的文件，防目录穿越。
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = join(CLIENT_DIST, rel === "" ? "index.html" : rel);
  if (!file.startsWith(CLIENT_DIST)) return null;
  try {
    const st = await stat(file);
    if (!st.isFile()) return null;
    const body = await Bun.file(file).arrayBuffer();
    return new Response(body, {
      headers: { "content-type": CONTENT_TYPES[extOf(file)] ?? "application/octet-stream" },
    });
  } catch {
    return null;
  }
}

async function handleAction(name: string, req: Request): Promise<Response> {
  const def = actionDefs.get(name);
  if (!def) {
    return jsonError(404, `未知动作：${name}`, "UNKNOWN_ACTION");
  }
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return jsonError(400, "请求体不是合法 JSON", "BAD_JSON");
  }
  // 兼容 SDK 旧信封 { action, args }；本地客户端直接发入参。
  const args =
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "args" in body &&
    "action" in body
      ? (body as { args: unknown }).args
      : body;
  let parsedArgs: unknown;
  try {
    parsedArgs = def.request.parse(args);
  } catch (e) {
    return jsonError(400, `入参校验失败：${e instanceof Error ? e.message : String(e)}`, "BAD_REQUEST");
  }
  const ctx = createLocalCtx({
    ...(req.headers.get("x-geeknow-api-key")?.trim()
      ? { geeknowKey: req.headers.get("x-geeknow-api-key")!.trim() }
      : {}),
    ...(req.headers.get("x-geeknow-api-base")?.trim()
      ? { geeknowBase: req.headers.get("x-geeknow-api-base")!.trim() }
      : {}),
  });
  try {
    const result = await def.handler(ctx, parsedArgs);
    let data: unknown;
    try {
      data = def.response.parse(result);
    } catch (e) {
      return jsonError(500, `出参校验失败：${e instanceof Error ? e.message : String(e)}`, "BAD_RESPONSE");
    }
    return Response.json({ ok: true, data });
  } catch (e) {
    if (e instanceof NotImplementedError) {
      return jsonError(503, e.message, e.code);
    }
    console.error(`[action:${name}]`, e);
    return jsonError(500, e instanceof Error ? e.message : String(e), "HANDLER_ERROR");
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/health") {
      return Response.json({
        ok: true,
        service: "script-workbench-port",
        version: "v5.69-port-p2",
        actions: actionNames.length,
        time: new Date().toISOString(),
      });
    }

    if (req.method === "POST" && pathname.startsWith("/api/actions/")) {
      const name = decodeURIComponent(pathname.slice("/api/actions/".length));
      if (!name || name.includes("/")) {
        return jsonError(404, "动作名不合法", "UNKNOWN_ACTION");
      }
      return handleAction(name, req);
    }

    if (req.method === "GET" && pathname.startsWith("/blobs/")) {
      const key = decodeURIComponent(pathname.slice("/blobs/".length));
      const blob = readBlobFile(key);
      if (!blob) {
        return jsonError(404, `blob 不存在：${key}`, "BLOB_NOT_FOUND");
      }
      const file = Bun.file(blob.path);
      const baseHeaders: Record<string, string> = {
        "content-type": blob.contentType,
        "accept-ranges": "bytes",
        etag: `"${blob.etag}"`,
      };
      const range = req.headers.get("range");
      if (!range) {
        return new Response(file, {
          headers: { ...baseHeaders, "content-length": String(blob.size) },
        });
      }
      // Range: bytes=start-end / bytes=start- / bytes=-suffix（只支持单段）。
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!m) {
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, "content-range": `bytes */${blob.size}` },
        });
      }
      let start: number;
      let end: number;
      if (m[1] === "" && m[2] === "") {
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, "content-range": `bytes */${blob.size}` },
        });
      } else if (m[1] === "") {
        const suffix = Number(m[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) {
          return new Response(null, {
            status: 416,
            headers: { ...baseHeaders, "content-range": `bytes */${blob.size}` },
          });
        }
        start = Math.max(0, blob.size - suffix);
        end = blob.size - 1;
      } else {
        start = Number(m[1]);
        end = m[2] === "" ? blob.size - 1 : Number(m[2]);
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        start >= blob.size
      ) {
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, "content-range": `bytes */${blob.size}` },
        });
      }
      end = Math.min(end, blob.size - 1);
      return new Response(file.slice(start, end + 1), {
        status: 206,
        headers: {
          ...baseHeaders,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${blob.size}`,
        },
      });
    }

    if (req.method === "GET") {
      const file = await serveStatic(pathname === "/" ? "/index.html" : pathname);
      if (file) return file;
      // 前端路由兜底：未知路径且无扩展名时回 index.html（单页应用）。
      if (!extOf(pathname)) {
        const index = await serveStatic("/index.html");
        if (index) return index;
      }
      return jsonError(404, `未找到：${pathname}`, "NOT_FOUND");
    }

    return jsonError(404, `不支持的请求：${req.method} ${pathname}`, "NOT_FOUND");
  },
});

console.log(
  `script-workbench-port listening on http://${HOST}:${server.port} ` +
    `(actions: ${actionNames.length}, client: ${CLIENT_DIST})`,
);
