// exe 专属左侧聊天 · 解剖编排（移植层，第二期）。
//
// 归属：只属于 GitHub exe 壳层，Muse 内工作台看不见它。
// 绝不放进 client/src 与 server/src/actions.ts——每日同步会覆盖那两处。
// 本模块只做编排：调 server/src/actions.ts 里已有的解剖动作 handler
// （场景切分 / 转写启动轮询 / 融合 / 资产定稿 / 存记录 / 一键套用）
// 与 privileged.ts 里已有的本地能力（Whisper 转写、场景检测、云端下载），
// 管线本身一行不重写。确定性组装（节拍/人物合并/主角筛选）按 v4.86
// 已下线的客户端编排口径在服务端重做——v4.87 起工作台页面已无
// AI解剖入口，那套组装逻辑只剩 changelog 里的文字口径可循，本模块
// 按口径重做并在验证记录里写清每一处的取舍。
//
// 精修规则（项目 41 标准，DISSECT_CHAT_RULES 同款，见 EXE_CHAT_DISSECT_RULES）：
// 台词一字不差、人物锁定、台词仅配音不烧录字幕、存疑标 lowConfidence、
// 看不见的不编造、actionSeconds 用整数、groups 的 sceneName 与资产
// scenes 的 name 逐字相同。
//
// 视觉说明（诚实口径）：融合层读帧走 ctx.inference（带图时 Geeknow
// 视觉模型 doubao-seed-1-6-vision-250815），该模型未验证——沙箱无
// 真实 Key 无法确认它是否存在，视觉探针只做到 fake-key 路由探活。
// 视觉调用失败时融合层退回纯文本（不带帧）并在结果里明记 visionUsed
// 与告警，绝不假装逐帧校对已跑通。真实视觉质量留真机核验。

import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Actions } from "./actions";
import { createLocalCtx } from "./ctx";
import { resolveDataDir } from "./db";
import type { GeeknowRequestAuth } from "./local-sdk";
import { z } from "./local-sdk";
import { privileged } from "./privileged";
import { resolveFfmpeg, resolveFfprobe } from "./python-runtime";
import { EXE_CHAT_DEFAULT_BASE } from "./exe-chat";

const execFileAsync = promisify(execFile);

/** 精修解剖 9 条（项目 41 聊天精修标准，写死；与工作台内 DISSECT_CHAT_RULES 同款）。 */
export const EXE_CHAT_DISSECT_RULES =
  "请按聊天精修方法做 1:1 复刻解剖，规则如下（项目 41 同款标准，一条不许少）：\n" +
  "1. 核台词：先用 tiny ASR 定时间轴与台词条数，ASR 文字只是草稿；再以 1fps 逐帧读烧录字幕核对台词，字幕与 ASR 对不上时以字幕为准；易错处（快语速、重叠说话、谐音梗、生僻字）用 3fps 复核。\n" +
  "2. 对说话人：说话人按口型、画面构图、语义闭环对位；对不上的句标存疑（lowConfidence），绝不编造台词、不靠看图猜台词；最后数一遍台词总数，跟时间轴对上。\n" +
  "3. 台词口径：台词仅配音、不烧录字幕；台词一字不差。\n" +
  "4. 人物锁定：人物严格锁定，A/B/C/D 与外貌一一对应，严禁互换串演。\n" +
  "5. 人物筛选：人物只取最多 10 位主角，按台词量＋出镜时长排序，龙套过滤。\n" +
  "6. 场景与道具：场景逐个写详细提示词；分镜 groups 的 sceneName 必须与资产 scenes 的 name 逐字相同；道具有特殊才加，无则不加。\n" +
  "7. 时长口径：actionSeconds 必须用整数。\n" +
  "8. 输出：剧本格式01分镜表＋资产清单＋转写原文。\n" +
  "9. 存档套用：做完按分析模仿页现有记录格式存入分析记录，并用裸标题一键套用成新项目。";

/** 融合层带图时走的视觉模型名（未验证，见文件头视觉说明）。 */
export const EXE_CHAT_VISION_MODEL = "doubao-seed-1-6-vision-250815";

/** 文本模型工作默认值：融合/定稿经 ctx.inference，默认模型已死时才临时顶上（用完还原）。 */
const WORKING_TEXT_MODEL = "deepseek-v4-flash";
const DEAD_TEXT_MODEL = "deepseek-chat";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]+$/;
const MAX_UPLOAD_BASE64 = 270_000_000;
const MAX_FRAMES = 300;
const FRAME_MAX_EDGE = 480;

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type DissectMode = "full" | "plan" | "local-verify";

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  speakerCluster: string;
  confidence: number;
  lowConfidence: boolean;
};

type ShotDef = { idx: number; startSec: number; endSec: number };

type FrameInfo = { timeSec: number; file: string };

type WindowInput = {
  unitIndex: number;
  shots: ShotDef[];
  segments: (TranscriptSegment & { idx: number })[];
  frames: FrameInfo[];
};

type FuseShotResult = {
  idx: number;
  title: string;
  sceneName: string;
  framing: string;
  camera: string;
  visualSummary: string;
};

type FuseCharacterResult = {
  name: string;
  identity: string;
  look: string;
  voice: string;
  tone: string;
  clusters: string[];
};

type MergedCharacter = FuseCharacterResult & { firstSeen: number };

type StepState = {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  detail: string;
};

export type DissectJobResult = {
  analysisId: number | null;
  projectId: number | null;
  segmentCount: number;
  beatCount: number;
  dialogueBeatCount: number;
  lineCountMatch: boolean;
  totalSeconds: number;
  shotCount: number;
  windowCount: number;
  frameCount: number;
  visionUsed: boolean;
  visionStatus: string;
  failedWindows: number[];
  sceneMethod: string;
  qualityNote: string;
  warnings: string[];
};

export type DissectJobState = {
  jobId: string;
  videoId: string;
  mode: DissectMode;
  status: "queued" | "running" | "done" | "failed";
  step: string;
  steps: StepState[];
  createdAtMs: number;
  updatedAtMs: number;
  result: DissectJobResult | null;
  error: string | null;
};

const jobs = new Map<string, DissectJobState>();

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function jsonError(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

function newId(prefix: string): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.floor(Math.random() * 1_000_000)
      .toString(36)
      .padStart(4, "0")
  );
}

function authFrom(
  body: { apiKey?: string; apiBase?: string },
  req: Request,
): GeeknowRequestAuth | undefined {
  const key =
    body.apiKey?.trim() || req.headers.get("x-geeknow-api-key")?.trim() || "";
  const base =
    body.apiBase?.trim() || req.headers.get("x-geeknow-api-base")?.trim() || "";
  if (!key && !base) return undefined;
  return {
    ...(key ? { geeknowKey: key } : {}),
    ...(base ? { geeknowBase: base } : {}),
  };
}

function cloudBaseDir(): string {
  return join(resolveDataDir(), "video-cloud");
}

function cloudVideosDir(): string {
  return join(cloudBaseDir(), "videos");
}

function cloudVideoPath(videoId: string): string {
  return join(cloudVideosDir(), videoId + ".mp4");
}

function cloudStatePath(): string {
  return join(cloudBaseDir(), "state.json");
}

function localStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    p(d.getMonth() + 1) +
    "-" +
    p(d.getDate()) +
    " " +
    p(d.getHours()) +
    ":" +
    p(d.getMinutes())
  );
}

/** state.json 的 downloaded 合并一条（缺失/损坏按空清单容错，原子 tmp/rename 写回）。 */
async function upsertCloudState(
  videoId: string,
  size: number,
): Promise<void> {
  await mkdir(cloudBaseDir(), { recursive: true });
  let root: Record<string, unknown> = {};
  try {
    const raw = await readFile(cloudStatePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      root = parsed as Record<string, unknown>;
    }
  } catch {
    root = {};
  }
  const downloaded =
    root.downloaded && typeof root.downloaded === "object"
      ? (root.downloaded as Record<string, unknown>)
      : {};
  downloaded[videoId] = {
    file: videoId + ".mp4",
    size,
    at: localStamp(),
  };
  root.downloaded = downloaded;
  const tmp = cloudStatePath() + ".tmp-" + process.pid;
  await writeFile(tmp, JSON.stringify(root, null, 2), "utf8");
  await rename(tmp, cloudStatePath());
}

async function removeCloudState(videoId: string): Promise<void> {
  try {
    const raw = await readFile(cloudStatePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const root = parsed as Record<string, unknown>;
    const downloaded = root.downloaded;
    if (!downloaded || typeof downloaded !== "object") return;
    delete (downloaded as Record<string, unknown>)[videoId];
    const tmp = cloudStatePath() + ".tmp-" + process.pid;
    await writeFile(tmp, JSON.stringify(root, null, 2), "utf8");
    await rename(tmp, cloudStatePath());
  } catch {
    // 清理失败不拦主流程。
  }
}

async function probeVideo(
  file: string,
): Promise<{ ok: boolean; durationSec: number; hasVideo: boolean; hasAudio: boolean; error: string | null }> {
  try {
    const ffprobe = resolveFfprobe();
    const { stdout } = await execFileAsync(
      ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        file,
      ],
      { timeout: 30_000, maxBuffer: 1_000_000 },
    );
    const parsed = JSON.parse(stdout) as {
      streams?: { codec_type?: string }[];
      format?: { duration?: string };
    };
    const types = (parsed.streams ?? []).map((s) => s.codec_type ?? "");
    const durationSec = Number(parsed.format?.duration ?? 0);
    return {
      ok: types.includes("video") && Number.isFinite(durationSec) && durationSec > 0,
      durationSec: Number.isFinite(durationSec) ? durationSec : 0,
      hasVideo: types.includes("video"),
      hasAudio: types.includes("audio"),
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      durationSec: 0,
      hasVideo: false,
      hasAudio: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 文本模型临时顶替：融合/定稿经 ctx.inference，默认文本模型已死
 * （Geeknow 503 model_not_found）时，调用期间把环境默认值顶成已验
 * 证可用的 deepseek-v4-flash，用完立刻还原。只影响本次调用期间，
 * 不改全局默认（全局换名等用户另定）。
 */
async function withWorkingTextModel<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.GEEKNOW_CHAT_MODEL;
  const needsOverride = !prev?.trim() || prev.trim() === DEAD_TEXT_MODEL;
  if (needsOverride) process.env.GEEKNOW_CHAT_MODEL = WORKING_TEXT_MODEL;
  try {
    return await fn();
  } finally {
    if (needsOverride) {
      if (prev === undefined) delete process.env.GEEKNOW_CHAT_MODEL;
      else process.env.GEEKNOW_CHAT_MODEL = prev;
    }
  }
}

// ---------------------------------------------------------------------------
// 抽帧（ffmpeg 一次过，1fps，上限 300 帧；失败只记告警，不拦转写主路）
// ---------------------------------------------------------------------------

async function extractFrames(
  file: string,
  durationSec: number,
  outDir: string,
): Promise<{ frames: FrameInfo[]; warning: string | null }> {
  await mkdir(outDir, { recursive: true });
  const step = durationSec <= MAX_FRAMES ? 1 : durationSec / MAX_FRAMES;
  const fpsValue = 1 / step;
  try {
    const ffmpeg = resolveFfmpeg();
    await execFileAsync(
      ffmpeg,
      [
        "-v",
        "error",
        "-i",
        file,
        "-vf",
        "fps=" + fpsValue.toFixed(4) + ",scale='min(" + FRAME_MAX_EDGE + ",iw)':-2",
        "-q:v",
        "5",
        "-y",
        join(outDir, "frame_%04d.jpg"),
      ],
      { timeout: 300_000, maxBuffer: 4_000_000 },
    );
  } catch (e) {
    return {
      frames: [],
      warning:
        "抽帧失败（" +
        (e instanceof Error ? e.message : String(e)).slice(0, 200) +
        "），融合层按纯文本跑，画面未逐帧核对。",
    };
  }
  const names = (await readdir(outDir))
    .filter((n) => /^frame_\d+\.jpg$/.test(n))
    .sort()
    .slice(0, MAX_FRAMES);
  const frames = names.map((n, i) => ({
    timeSec: Math.round(i * step * 10) / 10,
    file: join(outDir, n),
  }));
  if (frames.length === 0) {
    return { frames: [], warning: "抽帧一张也没出，融合层按纯文本跑，画面未逐帧核对。" };
  }
  return { frames, warning: null };
}

async function readFrameBase64(
  frame: FrameInfo,
): Promise<{ dataBase64: string; mimeType: string } | null> {
  try {
    const buf = await readFile(frame.file);
    if (buf.length === 0 || buf.length > 1_500_000) return null;
    return { dataBase64: buf.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 镜头与融合窗（v4.86 口径：窗 ≤6 镜、≤28 句、≤8 帧）
// ---------------------------------------------------------------------------

function buildShots(cuts: number[], durationSec: number): ShotDef[] {
  const bounds = [0];
  const sorted = [...cuts]
    .filter((c) => Number.isFinite(c) && c > 0.5 && c < durationSec - 0.5)
    .sort((a, b) => a - b);
  for (const c of sorted) {
    if (c - bounds[bounds.length - 1]! >= 0.5) bounds.push(c);
  }
  bounds.push(durationSec);
  let shots: ShotDef[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    shots.push({ idx: i, startSec: bounds[i]!, endSec: bounds[i + 1]! });
  }
  // 镜头过多时合并最短的相邻两镜，直到 ≤60 镜（融合窗 idx 上限内）。
  while (shots.length > 60) {
    let mergeAt = 0;
    let shortest = Infinity;
    for (let i = 0; i < shots.length - 1; i++) {
      const span = shots[i + 1]!.endSec - shots[i]!.startSec;
      if (span < shortest) {
        shortest = span;
        mergeAt = i;
      }
    }
    const merged: ShotDef = {
      idx: mergeAt,
      startSec: shots[mergeAt]!.startSec,
      endSec: shots[mergeAt + 1]!.endSec,
    };
    shots = [...shots.slice(0, mergeAt), merged, ...shots.slice(mergeAt + 2)];
    shots = shots.map((s, i) => ({ ...s, idx: i }));
  }
  return shots;
}

function shotIndexForTime(shots: ShotDef[], t: number): number {
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i]!;
    if (t < s.endSec || i === shots.length - 1) return i;
  }
  return shots.length - 1;
}

function buildWindows(
  shots: ShotDef[],
  segments: TranscriptSegment[],
  frames: FrameInfo[],
): WindowInput[] {
  const indexed = segments.map((s, i) => ({ ...s, idx: i }));
  const windows: WindowInput[] = [];
  let cur: WindowInput = { unitIndex: 1, shots: [], segments: [], frames: [] };
  const flush = () => {
    if (cur.shots.length > 0) {
      windows.push(cur);
      cur = { unitIndex: windows.length + 1, shots: [], segments: [], frames: [] };
    }
  };
  for (const shot of shots) {
    const segs = indexed.filter(
      (s) => s.start >= shot.startSec - 0.001 && s.start < shot.endSec,
    );
    const shotFrames = frames.filter(
      (f) => f.timeSec >= shot.startSec && f.timeSec < shot.endSec,
    );
    if (
      cur.shots.length > 0 &&
      (cur.shots.length >= 6 ||
        cur.segments.length + segs.length > 28 ||
        cur.frames.length + shotFrames.length > 24)
    ) {
      flush();
    }
    cur.shots.push(shot);
    cur.segments.push(...segs);
    cur.frames.push(...shotFrames);
  }
  flush();
  // 每窗帧数压到 8 张：先保每镜中点帧，再均匀补齐。
  for (const w of windows) {
    if (w.frames.length <= 8) continue;
    const picked: FrameInfo[] = [];
    const seen = new Set<number>();
    for (const shot of w.shots) {
      const mid = (shot.startSec + shot.endSec) / 2;
      let best: FrameInfo | null = null;
      let bestDist = Infinity;
      for (const f of w.frames) {
        const d = Math.abs(f.timeSec - mid);
        if (d < bestDist) {
          bestDist = d;
          best = f;
        }
      }
      if (best && !seen.has(best.timeSec)) {
        seen.add(best.timeSec);
        picked.push(best);
      }
    }
    const rest = w.frames.filter((f) => !seen.has(f.timeSec));
    const stepFill = Math.max(1, Math.floor(rest.length / Math.max(1, 8 - picked.length)));
    for (let i = 0; i < rest.length && picked.length < 8; i += stepFill) {
      picked.push(rest[i]!);
    }
    w.frames = picked.sort((a, b) => a.timeSec - b.timeSec);
  }
  return windows;
}

// ---------------------------------------------------------------------------
// 人物合并与主角筛选（v4.86 口径：造型取最长口径、簇并集；
// 主角 score = 有声秒数 + 台词字数/8，前 4 位且 ≥ 榜首 12%、开口 ≥2 秒、至少 1 位）
// ---------------------------------------------------------------------------

const LETTER_POOL = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function normalizeCode(raw: string, used: Set<string>): string {
  const t = raw.trim();
  const m = /^([A-Ja-j])(?![A-Za-z])/.exec(t);
  if (m && m[1]) {
    const code = m[1].toUpperCase();
    if (!used.has(code)) return code;
    return code;
  }
  for (const c of LETTER_POOL) {
    if (!used.has(c)) return c;
  }
  return "A";
}

function mergeCharacters(
  windowChars: FuseCharacterResult[][],
): MergedCharacter[] {
  const merged = new Map<string, MergedCharacter>();
  const used = new Set<string>();
  let order = 0;
  for (const chars of windowChars) {
    for (const c of chars) {
      const code = normalizeCode(c.name, used);
      used.add(code);
      const prev = merged.get(code);
      const clusters = [...new Set([...(prev?.clusters ?? []), ...c.clusters])]
        .map((x) => x.trim())
        .filter(Boolean);
      const longest = (a: string, b: string) => (b.trim().length > a.trim().length ? b : a);
      if (!prev) {
        merged.set(code, {
          name: code,
          identity: c.identity,
          look: c.look,
          voice: c.voice,
          tone: c.tone,
          clusters,
          firstSeen: order++,
        });
      } else {
        merged.set(code, {
          ...prev,
          identity: longest(prev.identity, c.identity),
          look: longest(prev.look, c.look),
          voice: longest(prev.voice, c.voice),
          tone: longest(prev.tone, c.tone),
          clusters,
        });
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.firstSeen - b.firstSeen);
}

function rankMains(
  merged: MergedCharacter[],
  segments: TranscriptSegment[],
  clusterToCode: Map<string, string>,
): { name: string; identity: string; look: string; voice: string; tone: string; lineCount: number; speakSeconds: number }[] {
  const stats = new Map<string, { lineCount: number; speakSeconds: number; chars: number }>();
  for (const s of segments) {
    const code = clusterToCode.get(s.speakerCluster);
    if (!code) continue;
    const st = stats.get(code) ?? { lineCount: 0, speakSeconds: 0, chars: 0 };
    st.lineCount += 1;
    st.speakSeconds += Math.max(0, s.end - s.start);
    st.chars += s.text.length;
    stats.set(code, st);
  }
  const scored = merged
    .map((m) => {
      const st = stats.get(m.name) ?? { lineCount: 0, speakSeconds: 0, chars: 0 };
      return {
        name: m.name,
        identity: m.identity,
        look: m.look,
        voice: m.voice,
        tone: m.tone,
        lineCount: st.lineCount,
        speakSeconds: Math.round(st.speakSeconds * 10) / 10,
        score: st.speakSeconds + st.chars / 8,
      };
    })
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  const top = scored[0]!.score;
  const picked = scored.filter(
    (s) => s.speakSeconds >= 2 && (top <= 0 || s.score >= top * 0.12),
  );
  const mains = (picked.length > 0 ? picked : scored.slice(0, 1)).slice(0, 4);
  return mains.map((m) => ({
    name: m.name,
    identity: m.identity,
    look: m.look,
    voice: m.voice,
    tone: m.tone,
    lineCount: m.lineCount,
    speakSeconds: m.speakSeconds,
  }));
}

// ---------------------------------------------------------------------------
// 确定性组装（v4.86 assembleAsrGroups 口径：镜头内逐句成拍、实测
// 起止秒透传、≥0.8 秒静音间隙补静音拍、台词逐字照抄转写原文）
// ---------------------------------------------------------------------------

type AssembledBeat = {
  visual: string;
  sfx: string;
  speaker: string;
  emotion: string;
  line: string;
  actionSeconds: number;
  startSec: number;
  endSec: number;
  lowConf?: boolean;
};

type AssembledGroup = {
  title: string;
  sceneName: string;
  beats: AssembledBeat[];
};

function assembleGroups(
  shots: ShotDef[],
  segments: TranscriptSegment[],
  shotResults: Map<number, FuseShotResult>,
  lineNotes: Map<number, { emotion: string; visual: string; sfx: string }>,
  clusterToCode: Map<string, string>,
): AssembledGroup[] {
  const groups: AssembledGroup[] = [];
  const indexed = segments.map((s, idx) => ({ ...s, idx }));
  for (const shot of shots) {
    const segs = indexed.filter(
      (s) => s.start >= shot.startSec - 0.001 && s.start < shot.endSec,
    );
    const shotRes = shotResults.get(shot.idx);
    const title = shotRes?.title?.trim() || "镜头" + (shot.idx + 1);
    const sceneName = shotRes?.sceneName?.trim() || "场景" + (shot.idx + 1);
    const beats: AssembledBeat[] = [];
    let prevEnd = shot.startSec;
    for (const s of segs) {
      const gap = s.start - prevEnd;
      if (gap >= 0.8 && beats.length > 0) {
        beats.push({
          visual: shotRes?.visualSummary ?? "",
          sfx: "",
          speaker: "",
          emotion: "",
          line: "",
          actionSeconds: Math.max(1, Math.min(6, Math.round(gap))),
          startSec: Math.round(prevEnd * 10) / 10,
          endSec: Math.round(s.start * 10) / 10,
        });
      }
      const note = lineNotes.get(s.idx);
      beats.push({
        visual: note?.visual ?? "",
        sfx: note?.sfx ?? "",
        speaker: clusterToCode.get(s.speakerCluster) ?? "",
        emotion: note?.emotion ?? "",
        line: s.text,
        actionSeconds: 0,
        startSec: s.start,
        endSec: s.end,
        ...(s.lowConfidence ? { lowConf: true } : {}),
      });
      prevEnd = Math.max(prevEnd, s.end);
    }
    if (beats.length === 0) {
      // 无台词镜头：补一拍画面拍，时长取镜头跨度（整数秒，1~6 封顶；
      // 跨度本身由 startSec/endSec 实测值承载，actionSeconds 只作
      // 无台词拍的画面时长口径）。
      beats.push({
        visual: shotRes?.visualSummary ?? "",
        sfx: "",
        speaker: "",
        emotion: "",
        line: "",
        actionSeconds: Math.max(
          1,
          Math.min(6, Math.round(shot.endSec - shot.startSec)),
        ),
        startSec: Math.round(shot.startSec * 10) / 10,
        endSec: Math.round(shot.endSec * 10) / 10,
      });
    }
    groups.push({ title, sceneName, beats });
  }
  return groups;
}

/** 定稿失败 / 本地验证时的最小资产：只写真有的数据，提示词留空待模型补。 */
function minimalAssets(
  characters: { name: string; identity: string; look: string }[],
  groups: AssembledGroup[],
): {
  characters: { name: string; profile: string; promptZh: string; promptEn: string }[];
  scenes: { name: string; description: string; promptZh: string; promptEn: string }[];
  props: { name: string; description: string; promptZh: string }[];
} {
  const sceneNames: string[] = [];
  const sceneVisual = new Map<string, string>();
  for (const g of groups) {
    if (!sceneNames.includes(g.sceneName)) {
      sceneNames.push(g.sceneName);
      sceneVisual.set(
        g.sceneName,
        g.beats.map((b) => b.visual).filter(Boolean).join("；").slice(0, 500),
      );
    }
  }
  return {
    characters: characters.map((c) => ({
      name: c.name,
      profile: [c.identity, c.look].filter(Boolean).join("；"),
      promptZh: "",
      promptEn: "",
    })),
    scenes: sceneNames.map((name) => ({
      name,
      description: sceneVisual.get(name) ?? "",
      promptZh: "",
      promptEn: "",
    })),
    props: [],
  };
}

/** 强制资产场景名与分镜 groups 的 sceneName 逐字相同（规则 6）。 */
function alignAssetScenes(
  assets: {
    characters: { name: string; profile: string; promptZh: string; promptEn: string }[];
    scenes: { name: string; description: string; promptZh: string; promptEn: string }[];
    props: { name: string; description: string; promptZh: string }[];
  },
  groups: AssembledGroup[],
): typeof assets {
  const byName = new Map(assets.scenes.map((s) => [s.name, s]));
  const scenes = [...new Set(groups.map((g) => g.sceneName))].map((name) => {
    const hit = byName.get(name);
    if (hit) return hit;
    const visual = groups
      .filter((g) => g.sceneName === name)
      .flatMap((g) => g.beats.map((b) => b.visual))
      .filter(Boolean)
      .join("；")
      .slice(0, 500);
    return { name, description: visual, promptZh: "", promptEn: "" };
  });
  return { ...assets, scenes };
}

// 模型调用串行化：withWorkingTextModel 换环境变量期间，两个任务
// 同时跑会互相还原，串行后一次只换一个任务的调用，互不干扰。
let modelCallQueue: Promise<void> = Promise.resolve();

function runModelCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = modelCallQueue.then(() => withWorkingTextModel(fn));
  modelCallQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ---------------------------------------------------------------------------
// 编排主流程（后台跑，状态进 jobs 供轮询）
// ---------------------------------------------------------------------------

const STEP_NAMES = [
  "scenes",
  "transcribe",
  "frames",
  "fuse",
  "assemble",
  "save",
] as const;

type DissectInput = {
  videoId: string;
  title: string;
  creatorName: string;
  description: string;
  durationText: string;
  mode: DissectMode;
  apply: boolean;
  auth: GeeknowRequestAuth | undefined;
};

async function runDissectJob(
  job: DissectJobState,
  input: DissectInput,
): Promise<void> {
  const warnings: string[] = [];
  const tmpDir = join(resolveDataDir(), "exe-chat-tmp", job.jobId);
  const mark = (
    name: string,
    status: StepState["status"],
    detail: string,
  ) => {
    const step = job.steps.find((s) => s.name === name);
    if (step) {
      step.status = status;
      step.detail = detail;
    }
    job.step = name;
    job.updatedAtMs = Date.now();
  };
  try {
    job.status = "running";
    const ctx = createLocalCtx(input.auth);
    const videoFile = cloudVideoPath(input.videoId);

    // 1) 场景切分
    mark("scenes", "running", "正在做场景切分…");
    const sceneDef = Actions.detectCloudScenes;
    const sceneRes = await sceneDef.handler(
      ctx,
      sceneDef.request.parse({ videoId: input.videoId }),
    );
    let durationSec = sceneRes.durationSec;
    let cuts = sceneRes.cuts;
    let sceneMethod: string = sceneRes.method;
    const probe = await probeVideo(videoFile);
    if (!probe.ok) {
      throw new Error(
        "视频文件找不到或不是有效视频（" +
          (probe.error ?? "ffprobe 读不到视频流") +
          "），请重新上传或换一条链接。",
      );
    }
    if (durationSec <= 0) durationSec = probe.durationSec;
    if (!sceneRes.ok || sceneRes.method === "none") {
      sceneMethod = "fallback-uniform";
      cuts = [];
      warnings.push(
        "场景检测没跑出来（" +
          (sceneRes.error ?? "method=none") +
          "），改按每 10 秒均匀切镜，镜头边界可能把一句话拦腰切在两镜里。",
      );
    }
    let shots = buildShots(cuts, durationSec);
    if (cuts.length === 0) {
      shots = [];
      const stepSec = 10;
      for (let t = 0; t < durationSec; t += stepSec) {
        shots.push({
          idx: shots.length,
          startSec: Math.round(t * 10) / 10,
          endSec: Math.round(Math.min(durationSec, t + stepSec) * 10) / 10,
        });
      }
      if (shots.length === 0) {
        shots = [{ idx: 0, startSec: 0, endSec: Math.round(durationSec * 10) / 10 }];
      }
    }
    mark(
      "scenes",
      "done",
      "切分通道 " + sceneMethod + "，共 " + shots.length + " 个镜头，总时长 " + durationSec.toFixed(1) + " 秒。",
    );

    // 2) 转写（启动 + 轮询，后台任务制）
    mark("transcribe", "running", "正在转写台词（本地 Whisper）…");
    const startDef = Actions.startCloudTranscription;
    const started = await startDef.handler(
      ctx,
      startDef.request.parse({ videoId: input.videoId }),
    );
    if (!started.ok || !started.jobId) {
      throw new Error(started.error ?? "转写任务没启动起来，请稍后再试。");
    }
    const pollDef = Actions.pollTranscription;
    let segments: TranscriptSegment[] = [];
    let done = false;
    for (let i = 0; i < 225; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const polled = await pollDef.handler(
        ctx,
        pollDef.request.parse({ jobId: started.jobId, source: "cloud" }),
      );
      if (polled.status === "done") {
        segments = polled.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          speakerCluster: s.speakerCluster,
          confidence: s.confidence,
          lowConfidence: s.lowConfidence,
        }));
        done = true;
        break;
      }
      if (polled.status === "failed") {
        throw new Error(polled.error ?? "转写任务失败了，请重试一次。");
      }
      mark("transcribe", "running", "转写进行中…（已等 " + ((i + 1) * 4) + " 秒）");
    }
    if (!done) {
      throw new Error("转写超过 15 分钟还没出结果，已停下，请重试一次。");
    }
    if (segments.length === 0) {
      throw new Error(
        "转写一句台词也没出（视频可能没有说话声）。没有台词就不硬编解剖，请换一条有说话的视频。",
      );
    }
    const lowCount = segments.filter((s) => s.lowConfidence).length;
    mark(
      "transcribe",
      "done",
      "转写出 " + segments.length + " 句台词，低置信 " + lowCount + " 句。",
    );

    // 3) 抽帧（1fps，最佳努力）
    mark("frames", "running", "正在抽关键帧…");
    const extracted = await extractFrames(videoFile, durationSec, tmpDir);
    if (extracted.warning) warnings.push(extracted.warning);
    const frames = extracted.frames;
    mark("frames", "done", "抽到 " + frames.length + " 帧（1fps，上限 300）。");

    // 4) 融合窗
    const windows = buildWindows(shots, segments, frames);
    const shotResults = new Map<number, FuseShotResult>();
    const lineNotes = new Map<number, { emotion: string; visual: string; sfx: string }>();
    const windowChars: FuseCharacterResult[][] = [];
    const failedWindows: number[] = [];
    let visionUsed = false;
    let visionStatus = "未跑融合（计划/本地验证模式不调用模型）。";
    if (input.mode === "full") {
      mark("fuse", "running", "正在逐窗融合（画面对位台词）…");
      const fuseDef = Actions.dissectFuseWindow;
      const known: { name: string; identity: string; look: string; clusters?: string[] }[] = [];
      for (const w of windows) {
        const frameArgs: { dataBase64: string; mimeType: string; timeSec: number; shotIdx: number }[] = [];
        for (const f of w.frames) {
          const b = await readFrameBase64(f);
          if (b) {
            frameArgs.push({
              ...b,
              timeSec: f.timeSec,
              shotIdx: shotIndexForTime(shots, f.timeSec),
            });
          }
        }
        const baseArgs = {
          title: input.title || undefined,
          creatorName: input.creatorName || undefined,
          durationText: input.durationText || undefined,
          description: input.description || undefined,
          unitIndex: w.unitIndex,
          unitCount: windows.length,
          windowStartSec: w.shots[0]!.startSec,
          windowEndSec: w.shots[w.shots.length - 1]!.endSec,
          mode: "asr" as const,
          shots: w.shots.map((s) => ({ idx: s.idx, startSec: s.startSec, endSec: s.endSec })),
          segments: w.segments.map((s) => ({
            idx: s.idx,
            startSec: s.start,
            endSec: s.end,
            text: s.text,
            cluster: s.speakerCluster,
            lowConfidence: s.lowConfidence,
          })),
          knownCharacters: known,
          frames: frameArgs,
        };
        let res = await runModelCall(() =>
          fuseDef.handler(ctx, fuseDef.request.parse(baseArgs)),
        );
        if (!res.ok && frameArgs.length > 0) {
          const retry = await runModelCall(() =>
            fuseDef.handler(
              ctx,
              fuseDef.request.parse({ ...baseArgs, frames: [] }),
            ),
          );
          if (retry.ok) {
            warnings.push(
              "第 " + w.unitIndex + " 窗带图融合失败（" + (res.error ?? "模型错误") + "），改纯文本融合补上，画面未逐帧核对。",
            );
            res = retry;
          }
        } else if (res.ok && frameArgs.length > 0) {
          visionUsed = true;
        }
        if (!res.ok || !res.result) {
          failedWindows.push(w.unitIndex);
          warnings.push("第 " + w.unitIndex + " 窗融合失败：" + (res.error ?? "未知错误") + "，该窗画面注记留空，台词不受影响。");
          continue;
        }
        for (const s of res.result.shots) {
          shotResults.set(s.idx, {
            idx: s.idx,
            title: s.title,
            sceneName: s.sceneName,
            framing: s.framing,
            camera: s.camera,
            visualSummary: s.visualSummary,
          });
        }
        for (const n of res.result.lineNotes) {
          lineNotes.set(n.idx, { emotion: n.emotion, visual: n.visual, sfx: n.sfx });
        }
        windowChars.push(res.result.characters);
        const mergedSoFar = mergeCharacters(windowChars);
        known.length = 0;
        for (const m of mergedSoFar) {
          known.push({ name: m.name, identity: m.identity, look: m.look, clusters: m.clusters });
        }
        mark("fuse", "running", "融合进行中…（" + w.unitIndex + "/" + windows.length + " 窗）");
      }
      if (windows.length > 0 && failedWindows.length === windows.length) {
        throw new Error("融合层全部窗口都失败了，台词还在但画面对位没做出来，请重试一次。");
      }
      visionStatus = visionUsed
        ? "已用帧融合（视觉模型 " + EXE_CHAT_VISION_MODEL + "，沙箱未验证、真机以实测为准）。"
        : "未用帧融合（视觉调用失败或无帧，已退回纯文本融合，画面未逐帧核对）。";
      mark(
        "fuse",
        "done",
        "融合完成 " + (windows.length - failedWindows.length) + "/" + windows.length + " 窗，失败窗：" + (failedWindows.length ? failedWindows.join("、") : "无") + "。",
      );
    } else {
      mark("fuse", "skipped", "本模式不调用模型融合。");
    }

    // 5) 人物合并 + 说话人对位 + 组装
    mark("assemble", "running", "正在组装分镜表…");
    let merged = mergeCharacters(windowChars);
    const clusterToCode = new Map<string, string>();
    for (const m of merged) {
      for (const cl of m.clusters) {
        if (!clusterToCode.has(cl)) clusterToCode.set(cl, m.name);
      }
    }
    // 未对位簇：按序补「待核对」人物行（v4.86 口径），总人数上限 10 位。
    const unmapped: string[] = [];
    for (const s of segments) {
      if (!clusterToCode.has(s.speakerCluster) && !unmapped.includes(s.speakerCluster)) {
        unmapped.push(s.speakerCluster);
      }
    }
    const usedCodes = new Set(merged.map((m) => m.name));
    for (const cl of unmapped) {
      let code = "";
      for (const c of LETTER_POOL) {
        if (!usedCodes.has(c)) {
          code = c;
          break;
        }
      }
      if (!code) {
        // 已满 10 位：剩余簇并入最后一位待核对行，并在备注里点名。
        const last = merged[merged.length - 1]!;
        code = last.name;
        last.clusters.push(cl);
        last.identity += "；另含未对位簇 " + cl;
      } else {
        usedCodes.add(code);
        merged.push({
          name: code,
          identity: "待核对（声线簇 " + cl + " 未对位到人物）",
          look: "待核对",
          voice: "待核对",
          tone: "待核对",
          clusters: [cl],
          firstSeen: merged.length,
        });
      }
      clusterToCode.set(cl, code);
    }
    if (merged.length === 0) {
      // 无融合结果时（计划/本地验证模式）：簇直映代号，全部标待核对。
      const clusters = [...new Set(segments.map((s) => s.speakerCluster))].slice(0, 10);
      clusters.forEach((cl, i) => {
        const code = LETTER_POOL[i]!;
        clusterToCode.set(cl, code);
        merged.push({
          name: code,
          identity: "待核对（未跑融合，声线簇 " + cl + " 直映）",
          look: "待核对",
          voice: "待核对",
          tone: "待核对",
          clusters: [cl],
          firstSeen: i,
        });
      });
    }
    const groups = assembleGroups(shots, segments, shotResults, lineNotes, clusterToCode);
    const characterRows = merged.map((m) => ({
      name: m.name,
      identity: m.identity,
      look: m.look,
      voice: m.voice,
      tone: m.tone,
    }));
    const transcript = segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
      speaker: clusterToCode.get(s.speakerCluster) ?? "",
      cluster: s.speakerCluster,
      confidence: s.confidence,
      lowConfidence: s.lowConfidence,
    }));

    // 6) 资产定稿（完整模式才调模型；其余模式用最小资产）
    let synopsis = "";
    let generationNotes: string[] = [
      "由 AI 解剖原视频分镜套用生成，角色造型全程锁定一致，画面内不烧录文字。",
    ];
    let assets = minimalAssets(
      characterRows.map((c) => ({ name: c.name, identity: c.identity, look: c.look })),
      groups,
    );
    if (input.mode === "full") {
      const mains = rankMains(merged, segments, clusterToCode);
      if (mains.length > 0) {
        const sceneInputs = [...new Set(groups.map((g) => g.sceneName))].map((name) => {
          const gs = groups.filter((g) => g.sceneName === name);
          const seconds = gs.reduce(
            (sum, g) =>
              sum +
              g.beats.reduce((s, b) => s + Math.max(0, b.endSec - b.startSec), 0),
            0,
          );
          const visualSummary = gs
            .flatMap((g) => g.beats.map((b) => b.visual))
            .filter(Boolean)
            .join("；")
            .slice(0, 2000);
          return { name, seconds: Math.round(seconds * 10) / 10, visualSummary };
        });
        const calFrames: { dataBase64: string; mimeType: string; timeSec: number }[] = [];
        const calPick = frames.length > 0 ? [frames[0]!, frames[Math.floor(frames.length / 2)]!] : [];
        for (const f of calPick) {
          if (!f) continue;
          const b = await readFrameBase64(f);
          if (b && !calFrames.some((x) => x.timeSec === f.timeSec)) {
            calFrames.push({ ...b, timeSec: f.timeSec });
          }
        }
        const finDef = Actions.dissectFinalizeAssets;
        const finRes = await runModelCall(() =>
          finDef.handler(
            ctx,
            finDef.request.parse({
              title: input.title || undefined,
              creatorName: input.creatorName || undefined,
              durationText: input.durationText || undefined,
              description: input.description || undefined,
              mains: mains.map((m) => ({
                ...m,
                identity: m.identity.slice(0, 500),
                look: m.look.slice(0, 2000),
                voice: m.voice.slice(0, 500),
                tone: m.tone.slice(0, 500),
              })),
              scenes: sceneInputs.slice(0, 24),
              groupsSummary: groups.map((g) => ({
                title: g.title.slice(0, 300),
                sceneName: g.sceneName.slice(0, 300),
              })),
              transcriptText: segments.map((s) => s.text).join("\n").slice(0, 16000),
              frames: calFrames.slice(0, 2),
            }),
          ),
        );
        if (finRes.ok && finRes.assets) {
          assets = finRes.assets;
          synopsis = finRes.synopsis;
          if (finRes.generationNotes.length > 0) generationNotes = finRes.generationNotes;
        } else {
          warnings.push("资产定稿失败（" + (finRes.error ?? "模型错误") + "），资产清单按最小版写，提示词留空待补。");
        }
      }
      assets = alignAssetScenes(assets, groups);
    } else if (input.mode === "local-verify") {
      synopsis = "【本地验证组装】未跑模型融合与资产定稿：台词与时间轴来自本地转写实测，人物与场景为占位口径，仅用于验证写库与套用通路。";
    }
    mark("assemble", "done", "组装出 " + groups.length + " 组、" + characterRows.length + " 位人物。");

    // 质量门
    const dialogueBeats = groups.flatMap((g) => g.beats).filter((b) => b.line !== "");
    const lineCountMatch =
      dialogueBeats.length === segments.length &&
      dialogueBeats.every((b, i) => b.line === segments[i]!.text);
    const qualityNote =
      "转写 " + segments.length + " 句 = 有台词节拍 " + dialogueBeats.length + " 句" +
      (lineCountMatch ? "（零丢失）" : "（不一致，请核对）") +
      "；总时长 " + durationSec.toFixed(1) + " 秒；低置信 " + lowCount + " 句；" +
      "视觉校对：" + visionStatus +
      (failedWindows.length > 0 ? "失败窗：" + failedWindows.join("、") + "；" : "") +
      (input.mode === "local-verify" ? "本地验证模式：融合与定稿未跑，结果仅验通路。" : "");
    if (!lineCountMatch) {
      warnings.push("台词数对不上：转写 " + segments.length + " 句，组装出 " + dialogueBeats.length + " 句有台词节拍。");
    }

    // 7) 存记录 + 套用 + 回读（计划模式不写库）
    let analysisId: number | null = null;
    let projectId: number | null = null;
    if (input.mode === "plan") {
      mark("save", "skipped", "计划模式不写库。");
    } else {
      mark("save", "running", "正在存分析记录…");
      const dissection = {
        mode: visionUsed ? ("vision" as const) : ("text" as const),
        frameCount: frames.length,
        totalSeconds: Math.round(durationSec * 10) / 10,
        synopsis,
        characterRows,
        groups,
        generationNotes,
        assets,
        failedWindows,
        segNote:
          sceneMethod === "fallback-uniform"
            ? "场景检测未跑出，按 10 秒均匀切镜。"
            : "场景切分通道：" + sceneMethod + "。",
        asrSource: "cloud" as const,
        transcript,
        qualityNote,
      };
      const dissectionJson = JSON.stringify(dissection);
      const saveDef = Actions.saveVideoAnalysis;
      const saved = await saveDef.handler(
        ctx,
        saveDef.request.parse({
          videoId: input.videoId,
          title: input.title || "未命名视频",
          creatorName: input.creatorName || undefined,
          durationText: input.durationText || undefined,
          description: input.description || undefined,
          dissectionJson,
        }),
      );
      if (!saved.ok || !saved.id) {
        throw new Error(saved.error ?? "分析记录没存上，请重试一次。");
      }
      analysisId = saved.id;
      if (input.apply) {
        mark("save", "running", "正在一键套用成新项目…");
        const applyDef = Actions.applyDissection;
        const applied = await applyDef.handler(
          ctx,
          applyDef.request.parse({
            analysisId,
            dissectionJson,
            title: input.title || "未命名视频",
            synopsis: synopsis || undefined,
            characterRows,
            groups,
            generationNotes,
            assets,
          }),
        );
        if (!applied.ok || !applied.projectId) {
          throw new Error(applied.error ?? "套用成项目失败，分析记录已存（id " + analysisId + "）。");
        }
        projectId = applied.projectId;
      }
      // 回读比对：经现有读动作核对写进去的东西
      const listDef = Actions.listVideoAnalyses;
      const listed = await listDef.handler(ctx, listDef.request.parse({}));
      const row = listed.analyses.find((a) => a.id === analysisId);
      if (!row) throw new Error("回读不到刚存的分析记录（id " + analysisId + "）。");
      const back = JSON.parse(row.dissectionJson) as { groups?: unknown[] };
      if (!Array.isArray(back.groups) || back.groups.length !== groups.length) {
        throw new Error("回读比对失败：分析记录里的分镜组数与写出的不一致。");
      }
      if (projectId !== null) {
        if (row.appliedProjectId !== projectId) {
          throw new Error("回读比对失败：分析记录的套用项目号与新项目不一致。");
        }
        const getDef = Actions.getProject;
        const proj = await getDef.handler(ctx, getDef.request.parse({ id: projectId }));
        if (!proj.project) throw new Error("回读不到刚建的新项目（id " + projectId + "）。");
        if (!proj.project.name.startsWith("解剖复刻：")) {
          throw new Error("回读比对失败：新项目名不是「解剖复刻：」开头。");
        }
        const scriptBack = JSON.parse(proj.project.scriptJson ?? "{}") as { groups?: unknown[] };
        if (!Array.isArray(scriptBack.groups) || scriptBack.groups.length !== groups.length) {
          throw new Error("回读比对失败：新项目里的分镜组数与写出的不一致。");
        }
      }
      mark(
        "save",
        "done",
        "分析记录 id " + analysisId + (projectId !== null ? "，新项目 id " + projectId : "（未套用）") + "，回读比对一致。",
      );
    }

    job.result = {
      analysisId,
      projectId,
      segmentCount: segments.length,
      beatCount: groups.flatMap((g) => g.beats).length,
      dialogueBeatCount: dialogueBeats.length,
      lineCountMatch,
      totalSeconds: Math.round(durationSec * 10) / 10,
      shotCount: shots.length,
      windowCount: windows.length,
      frameCount: frames.length,
      visionUsed,
      visionStatus,
      failedWindows,
      sceneMethod,
      qualityNote,
      warnings,
    };
    job.status = "done";
    job.step = "done";
    job.updatedAtMs = Date.now();
  } catch (e) {
    job.status = "failed";
    job.error = e instanceof Error ? e.message : String(e);
    const cur = job.steps.find((s) => s.status === "running");
    if (cur) {
      cur.status = "failed";
      cur.detail = job.error;
    }
    job.updatedAtMs = Date.now();
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// HTTP 入口（挂在 server.ts 的 exe 专属路由上）
// ---------------------------------------------------------------------------

const uploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  dataBase64: z.string().min(1).max(MAX_UPLOAD_BASE64),
});

/** POST /api/chat/dissect/upload：本地视频文件上传（base64 JSON），存进云端视频目录。 */
export async function handleExeChatDissectUpload(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonError(400, "请求体不是合法 JSON");
  }
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "入参校验失败：须带 fileName 与 dataBase64，文件不大于约 200MB。");
  }
  const videoId = newId("chat-");
  if (!VIDEO_ID_RE.test(videoId)) return jsonError(500, "内部视频编号生成失败");
  let buf: Buffer;
  try {
    buf = Buffer.from(parsed.data.dataBase64, "base64");
  } catch {
    return jsonError(400, "文件内容不是合法 base64。");
  }
  if (buf.length === 0) return jsonError(400, "文件是空的。");
  await mkdir(cloudVideosDir(), { recursive: true });
  const file = cloudVideoPath(videoId);
  await writeFile(file, buf);
  const probe = await probeVideo(file);
  if (!probe.ok) {
    await rm(file, { force: true }).catch(() => undefined);
    return jsonError(
      400,
      "这个文件不是有效视频（ffprobe 读不到视频流" +
        (probe.error ? "：" + probe.error.slice(0, 120) : "") +
        "），请换一个视频文件。",
    );
  }
  await upsertCloudState(videoId, buf.length);
  return Response.json({
    ok: true,
    videoId,
    fileName: parsed.data.fileName,
    sizeBytes: buf.length,
    durationSec: Math.round(probe.durationSec * 10) / 10,
    hasAudio: probe.hasAudio,
  });
}

const fromUrlSchema = z.object({
  url: z.string().min(1).max(4000),
  videoId: z.string().min(1).max(120).optional(),
});

/** POST /api/chat/dissect/from-url：粘贴视频链接，先下载到本机再处理（复用云端下载契约）。 */
export async function handleExeChatDissectFromUrl(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonError(400, "请求体不是合法 JSON");
  }
  const parsed = fromUrlSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "入参校验失败：须带 url。");
  }
  const url = parsed.data.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    return jsonError(400, "链接格式不对：需要以 http:// 或 https:// 开头的完整链接。");
  }
  const videoId = parsed.data.videoId?.trim() || newId("chat-");
  if (!VIDEO_ID_RE.test(videoId)) {
    return jsonError(400, "视频ID不合法（只允许字母、数字、下划线、中划线）。");
  }
  const ctx = createLocalCtx(authFrom({}, req));
  let r: { ok: boolean; alreadySaved: boolean; sizeBytes: number; error: string | null };
  try {
    r = await ctx.executePrivileged(privileged.cloudVideoDownload, { videoId, url });
  } catch (e) {
    return jsonError(502, "下载失败：" + (e instanceof Error ? e.message : String(e)).slice(0, 300));
  }
  if (!r.ok) {
    const raw = (r.error ?? "未知错误").trim();
    const msg = raw.startsWith("下载失败") ? raw : "下载失败：" + raw;
    return jsonError(
      502,
      msg + "。快手直链过期会报 403，请重新复制一条新鲜的链接。",
    );
  }
  const file = cloudVideoPath(videoId);
  const probe = await probeVideo(file);
  if (!probe.ok) {
    await rm(file, { force: true }).catch(() => undefined);
    await removeCloudState(videoId);
    return jsonError(
      400,
      "下载到的不是有效视频文件（这条链接可能不是视频直链，而是分享页地址）。请复制视频直链，或改选本地视频文件上传。",
    );
  }
  return Response.json({
    ok: true,
    videoId,
    sizeBytes: r.sizeBytes,
    alreadySaved: r.alreadySaved,
    durationSec: Math.round(probe.durationSec * 10) / 10,
    hasAudio: probe.hasAudio,
  });
}

const startSchema = z.object({
  videoId: z.string().min(1).max(120),
  title: z.string().max(500).optional(),
  creatorName: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  durationText: z.string().max(100).optional(),
  apiKey: z.string().max(500).optional(),
  apiBase: z.string().max(300).optional(),
  mode: z.enum(["full", "plan", "local-verify"]).optional(),
  apply: z.boolean().optional(),
});

/** POST /api/chat/dissect/start：启动一次解剖（后台跑，立刻回 jobId，进度用 status 轮询）。 */
export async function handleExeChatDissectStart(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonError(400, "请求体不是合法 JSON");
  }
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "入参校验失败：须带 videoId，mode 只能是 full / plan / local-verify。");
  }
  const d = parsed.data;
  if (!VIDEO_ID_RE.test(d.videoId)) {
    return jsonError(400, "视频ID不合法（只允许字母、数字、下划线、中划线）。");
  }
  const mode: DissectMode = d.mode ?? "full";
  if (mode === "full") {
    const hasKey =
      Boolean(d.apiKey?.trim()) ||
      Boolean(req.headers.get("x-geeknow-api-key")?.trim()) ||
      Boolean(process.env.GEEKNOW_API_KEY?.trim());
    if (!hasKey) {
      return jsonError(
        400,
        "完整解剖要调用模型，请先在左侧聊天框里填你自己的 Geeknow Key（只存这台电脑）。只想先看计划不花钱，选「只看计划」模式。",
      );
    }
  }
  try {
    const st = await stat(cloudVideoPath(d.videoId));
    if (!st.isFile() || st.size === 0) {
      return jsonError(404, "视频文件不存在（videoId：" + d.videoId + "），请先上传或下载。");
    }
  } catch {
    return jsonError(404, "视频文件不存在（videoId：" + d.videoId + "），请先上传或下载。");
  }
  const jobId = newId("job-");
  const job: DissectJobState = {
    jobId,
    videoId: d.videoId,
    mode,
    status: "queued",
    step: "queued",
    steps: STEP_NAMES.map((name) => ({ name, status: "pending" as const, detail: "" })),
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    result: null,
    error: null,
  };
  jobs.set(jobId, job);
  const input: DissectInput = {
    videoId: d.videoId,
    title: (d.title ?? "").trim(),
    creatorName: (d.creatorName ?? "").trim(),
    description: (d.description ?? "").trim(),
    durationText: (d.durationText ?? "").trim(),
    mode,
    apply: d.apply !== false,
    auth: authFrom({ apiKey: d.apiKey, apiBase: d.apiBase }, req),
  };
  void runDissectJob(job, input).catch((e: unknown) => {
    job.status = "failed";
    job.error = e instanceof Error ? e.message : String(e);
    job.updatedAtMs = Date.now();
  });
  return Response.json({ ok: true, jobId, status: "queued", mode, videoId: d.videoId });
}

/** GET /api/chat/dissect/status?jobId=…：查一次解剖任务的进度与结果（不含任何 Key）。 */
export async function handleExeChatDissectStatus(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) {
    return jsonError(404, "任务不存在（jobId：" + jobId.slice(0, 60) + "），可能服务重启过。");
  }
  return Response.json({ ok: true, job });
}

const visionProbeSchema = z.object({
  apiKey: z.string().max(500).optional(),
  apiBase: z.string().max(300).optional(),
});

/**
 * POST /api/chat/vision-probe：视觉模型探针——只查模型列表，不做
 * 任何生成、不计费。Key 无效/未提供时只能确认接口通不通，模型是
 * 否存在记为未验证，绝不谎报已通。Key 不回显、不记日志。
 */
export async function handleExeChatVisionProbe(req: Request): Promise<Response> {
  let body: unknown = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonError(400, "请求体不是合法 JSON");
  }
  const parsed = visionProbeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "入参校验失败。");
  }
  let base =
    parsed.data.apiBase?.trim() ||
    req.headers.get("x-geeknow-api-base")?.trim() ||
    process.env.GEEKNOW_API_BASE?.trim() ||
    EXE_CHAT_DEFAULT_BASE;
  if (!base.startsWith("https://")) {
    return jsonError(400, "API 地址格式不对：需要以 https:// 开头的完整地址");
  }
  base = base.replace(/\/+$/, "");
  if (base.endsWith("/v1")) base = base.slice(0, -3).replace(/\/+$/, "");
  const keyProvided = Boolean(
    parsed.data.apiKey?.trim() ||
      req.headers.get("x-geeknow-api-key")?.trim() ||
      process.env.GEEKNOW_API_KEY?.trim(),
  );
  const key =
    parsed.data.apiKey?.trim() ||
    req.headers.get("x-geeknow-api-key")?.trim() ||
    process.env.GEEKNOW_API_KEY?.trim() ||
    "probe-fake-key";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(base + "/v1/models", {
      method: "GET",
      headers: { authorization: "Bearer " + key },
      signal: controller.signal,
    });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      return Response.json({
        ok: true,
        verified: false,
        reachable: true,
        httpStatus: res.status,
        modelId: EXE_CHAT_VISION_MODEL,
        modelListed: null,
        keyProvided,
        note: keyProvided
          ? "Key 被接口拒了（HTTP " + res.status + "），无法确认视觉模型是否存在：未验证。"
          : "未提供真实 Key（用的探针假 Key），接口通但模型是否存在无法确认：未验证。请在真机上填自己的 Key 再探一次。",
      });
    }
    if (!res.ok) {
      return Response.json({
        ok: true,
        verified: false,
        reachable: true,
        httpStatus: res.status,
        modelId: EXE_CHAT_VISION_MODEL,
        modelListed: null,
        keyProvided,
        note: "模型列表接口返回 HTTP " + res.status + "，视觉模型未验证：" + text.slice(0, 200),
      });
    }
    let ids: string[] = [];
    try {
      const data = JSON.parse(text) as { data?: { id?: unknown }[] };
      ids = (data.data ?? [])
        .map((d) => (typeof d.id === "string" ? d.id : ""))
        .filter(Boolean);
    } catch {
      ids = [];
    }
    const listed = ids.includes(EXE_CHAT_VISION_MODEL);
    return Response.json({
      ok: true,
      verified: listed,
      reachable: true,
      httpStatus: res.status,
      modelId: EXE_CHAT_VISION_MODEL,
      modelListed: listed,
      keyProvided,
      note: listed
        ? "视觉模型在列表里，路由探通（真实读帧质量仍须真机实测）。"
        : "模型列表里没有 " + EXE_CHAT_VISION_MODEL + "（共 " + ids.length + " 个模型），视觉模型未验证。",
    });
  } catch (e) {
    return Response.json({
      ok: true,
      verified: false,
      reachable: false,
      httpStatus: null,
      modelId: EXE_CHAT_VISION_MODEL,
      modelListed: null,
      keyProvided,
      note:
        "探针请求失败：" +
        (e instanceof Error ? e.message : String(e)).slice(0, 200) +
        "，视觉模型未验证。",
    });
  } finally {
    clearTimeout(timer);
  }
}
