// 内嵌 Python / ffmpeg 运行时解析（P4，port-plan.md D4）。
//
// 打包形态（Windows exe）：安装包 resources/ 下自带
//   - resources/python/python.exe（官方 embeddable 版 + Pillow wheel 预解压，
//     不现场 pip、不依赖网络、不碰用户电脑上已有的 Python、不改系统 PATH）
//   - resources/ffmpeg/ffmpeg.exe、ffprobe.exe（gyan.dev 静态版）
// 开发期（Linux / macOS）：走系统 PATH 里的 python3 / ffmpeg / ffprobe。
//
// 解析顺序（python.exe 只在 win32 上考虑，Linux 下 resources 里的
// Windows 二进制跑不起来，不能误用）：
//   1. 环境变量 SCRIPTWORKBENCH_PYTHON_EXE（显式指定，最高优先）；
//   2. 安装包 resources 下的 python/python.exe（定位见 resolveResourcesDir）；
//   3. PATH 里的 python3（Linux/macOS 开发期）或 python（Windows 兜底）。
// 三处都找不到时 resolvePython() 直接抛中文错误，调用方原样回给前端，
// 不静默换一条跑不起来的命令。
//
// ffmpeg/ffprobe 同理：先找 resources/ffmpeg/ 下的 exe，找不到回落 PATH
// 里的同名命令（开发期）；内嵌脚本里写死的 "ffmpeg"/"ffprobe" 靠
// pythonHelperEnv() 把 resources/ffmpeg/ 追加到子进程 PATH 最前面解析，
// 脚本代码本身一行不动。
//
// 资源目录定位（resolveResourcesDir）：
//   - 环境变量 SCRIPTWORKBENCH_RESOURCES（Electron 主进程打包后可显式传入）；
//   - 编译后服务端 exe 所在目录（electron-builder 把 server exe 与
//     python/、ffmpeg/ 一起放在安装包 resources/ 下，见 electron-builder.yml）；
//   - 开发期源码树工程根下的 resources/（bun server.ts 时 import.meta.dir
//     即 server/src/，往上两级是工程根）。
// 只有目录下确实存在 python/python.exe 或 ffmpeg/ffmpeg.exe 时才算命中，
// 避免把 bun 可执行文件所在目录误认成资源目录。

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { resolveDataDir } from "./db";

export interface ResolvedPython {
  /** spawn 用的命令：内嵌 python.exe 的绝对路径，或 PATH 里的 python3/python。 */
  cmd: string;
  /** 固定前置参数（目前为空，留给以后例如 embeddable 的 -I 之类口径）。 */
  argsPrefix: string[];
  /** 给日志看的来源说明，例如 "resources/python/python.exe" 或 "PATH:python3"。 */
  source: string;
}

const WIN_PYTHON_REL = join("python", "python.exe");
const WIN_FFMPEG_REL = join("ffmpeg", "ffmpeg.exe");
const WIN_FFPROBE_REL = join("ffmpeg", "ffprobe.exe");

/** 找安装包 resources 目录：命中条件是目录下确实有内嵌 python 或 ffmpeg。 */
export function resolveResourcesDir(): string | null {
  const candidates: string[] = [];
  const fromEnv = process.env.SCRIPTWORKBENCH_RESOURCES?.trim();
  if (fromEnv) candidates.push(resolve(fromEnv));
  const resourcesPath = (process as unknown as { resourcesPath?: string })
    .resourcesPath;
  if (typeof resourcesPath === "string" && resourcesPath.trim()) {
    candidates.push(resolve(resourcesPath));
  }
  candidates.push(dirname(process.execPath));
  candidates.push(join(import.meta.dir, "..", "..", "resources"));
  for (const dir of candidates) {
    if (
      existsSync(join(dir, WIN_PYTHON_REL)) ||
      existsSync(join(dir, WIN_FFMPEG_REL))
    ) {
      return dir;
    }
  }
  return null;
}

/** 同步探一下 PATH 里的命令能不能跑（只做 --version，不产生副作用）。 */
function commandOnPath(cmd: string): boolean {
  try {
    const r = spawnSync(cmd, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

let cachedPython: ResolvedPython | null = null;
let runtimeLogged = false;

/** 解析内嵌 Python：优先安装包 resources/python/python.exe，其次 PATH。 */
export function resolvePython(): ResolvedPython {
  if (cachedPython) return cachedPython;
  const explicit = process.env.SCRIPTWORKBENCH_PYTHON_EXE?.trim();
  if (explicit && existsSync(explicit)) {
    cachedPython = {
      cmd: explicit,
      argsPrefix: [],
      source: `环境变量 SCRIPTWORKBENCH_PYTHON_EXE：${explicit}`,
    };
  } else if (process.platform === "win32") {
    const res = resolveResourcesDir();
    const embedded =
      res !== null ? join(res, WIN_PYTHON_REL) : null;
    if (embedded !== null && existsSync(embedded)) {
      cachedPython = {
        cmd: embedded,
        argsPrefix: [],
        source: `安装包内嵌：${embedded}`,
      };
    } else if (commandOnPath("python")) {
      cachedPython = { cmd: "python", argsPrefix: [], source: "PATH：python" };
    }
  } else if (commandOnPath("python3")) {
    cachedPython = { cmd: "python3", argsPrefix: [], source: "PATH：python3" };
  }
  if (!cachedPython) {
    throw new Error(
      "找不到可用的 Python：安装包里没有内嵌的 python.exe，系统 PATH 里也没有 python3（Windows 上是 python）。" +
        "请重装工作台，或把 Python 加进系统 PATH 后重启工作台。",
    );
  }
  logRuntimeOnce();
  return cachedPython;
}

let cachedFfmpeg: string | null = null;

/** 解析 ffmpeg：优先安装包 resources/ffmpeg/ffmpeg.exe，找不到回落 PATH。 */
export function resolveFfmpeg(): string {
  if (cachedFfmpeg !== null) return cachedFfmpeg;
  if (process.platform === "win32") {
    const res = resolveResourcesDir();
    const embedded = res !== null ? join(res, WIN_FFMPEG_REL) : null;
    if (embedded !== null && existsSync(embedded)) {
      cachedFfmpeg = embedded;
      return cachedFfmpeg;
    }
  }
  cachedFfmpeg = "ffmpeg";
  return cachedFfmpeg;
}

let cachedFfprobe: string | null = null;

/** 解析 ffprobe：优先安装包 resources/ffmpeg/ffprobe.exe，找不到回落 PATH。 */
export function resolveFfprobe(): string {
  if (cachedFfprobe !== null) return cachedFfprobe;
  if (process.platform === "win32") {
    const res = resolveResourcesDir();
    const embedded = res !== null ? join(res, WIN_FFPROBE_REL) : null;
    if (embedded !== null && existsSync(embedded)) {
      cachedFfprobe = embedded;
      return cachedFfprobe;
    }
  }
  cachedFfprobe = "ffprobe";
  return cachedFfprobe;
}

/** 内嵌 ffmpeg 所在目录的绝对路径（PATH 追加用）；回落 PATH 时返回 null。 */
export function resolveFfmpegDir(): string | null {
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg === "ffmpeg") return null;
  return dirname(ffmpeg);
}

/**
 * 给 Python 子进程用的环境变量：
 *  - DATA_DIR 一律显式传入解析后的数据目录（QUEUE_WORKER_PY 等脚本读它
 *    定位 video-cloud，不再写死 ~/workspace/video-cloud；Node 进程的
 *    env 会透传给 detached 子进程，这里显式写是防父进程没设 DATA_DIR 时
 *    子进程拿到旧默认值）；
 *  - PATH 最前面追加内嵌 ffmpeg 目录（SCENE_DETECT_PY / TRANSCRIBE_PY
 *    里写死的 "ffmpeg"/"ffprobe" 由此解析到安装包自带的二进制，
 *    脚本代码本身一行不动）。
 */
export function pythonHelperEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATA_DIR: resolveDataDir(),
  };
  const ffmpegDir = resolveFfmpegDir();
  if (ffmpegDir !== null) {
    const sep = process.platform === "win32" ? ";" : ":";
    const prev = process.env.PATH ?? "";
    if (!prev.split(sep).includes(ffmpegDir)) {
      env.PATH = prev ? ffmpegDir + sep + prev : ffmpegDir;
    }
  }
  return env;
}

function logRuntimeOnce(): void {
  if (runtimeLogged) return;
  runtimeLogged = true;
  try {
    const py = cachedPython;
    console.log(
      `[python-runtime] python=${py?.cmd ?? "?"}（${py?.source ?? "?"}），` +
        `ffmpeg=${resolveFfmpeg()}，ffprobe=${resolveFfprobe()}，` +
        `resources=${resolveResourcesDir() ?? "未找到（走 PATH 回落）"}，` +
        `dataDir=${resolveDataDir()}`,
    );
  } catch {
    // 日志失败不影响解析结果。
  }
}
