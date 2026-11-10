// ---------------------------------------------------------------------------
// AI解剖 · 浏览器本地抽帧（v4.56）
//
// 把视频文件链接直接在本机浏览器里加载，按时间逐帧截成 JPEG 小图
// （最长边 480、质量 0.62，单帧尽量小以便多帧一起送模型），只把
// 这些关键帧图送服务端视觉模型；视频本体不上传到任何第三方。
// 抽帧节奏：v4.75 起分两段——先按约 1.5 秒一帧采样候选帧（全
// 片最多 40 张），逐帧算清晰度 / 帧间差异 / 人脸；再按帧间差
// 异把候选帧聚成场景段、每场景挑最清晰（有人脸优先）的关键帧
// （总量约候选的 1/4、上限仍 40 封顶）送 AI，模糊帧与空镜帧
// 不再送。关键帧仍分批识别再合并（analysisbench 的 runDissect
// ion 编排，单批 ≤8 帧稳在平台单次图片上限 10 内），窗界对齐
// 场景段而不是均匀时间。任何一步失败
// 都抛错并写清原因，调用方据此降级纯文本并把原因明示给用户：
//   - 链接失效 / 格式不支持：loadedmetadata 前就 error；
//   - 跨域且对方没开 CORS：视频能播但 canvas 被污染，toDataURL
//     抛 SecurityError —— 这正是「跨域拿不到帧」的判定点。
//
// v4.71：抽帧来源扩到三种，同一套抽帧逻辑：
//   - 直链（快手 video_play_url，同源云端地址也是一个 URL）；
//   - 本地文件（用户在解剖弹窗里从电脑选的 mp4，File → 本地
//     object URL，不经过任何链接、文件不离开本机）；
//   另外加 probeVideoLink：抽帧前先对直链发一个快速 HEAD 探活，
//   403 / 超时直接判「链接已过期」，调用方据此立刻走纯文本降级，
//   不再让用户干等抽帧的 20 秒元数据超时才失败。
// ---------------------------------------------------------------------------

export type ExtractedFrame = {
  dataBase64: string;
  mimeType: "image/jpeg";
  timeSec: number;
  // v4.75 关键帧挑选的度量（候选帧采样时逐帧算出）：清晰度（拉普
  // 拉斯方差，越大越清晰）、与上一候选帧的平均像素差（0~1，场景
  // 切分的依据）、是否检出人脸（浏览器 FaceDetector 可用时才有，
  // 不可用恒 false）。sceneIndex = 这张关键帧属于第几个场景段。
  sharpness?: number;
  diffScore?: number;
  hasFace?: boolean;
  sceneIndex?: number;
};

/** 一个场景段时间段（秒）。 */
export type SceneSegment = {
  startSec: number;
  endSec: number;
  /** 段内候选帧下标范围（闭区间，按时间序）。 */
  firstIdx: number;
  lastIdx: number;
};

export type ExtractResult = {
  /** 挑好的关键帧（时间序），不是全部候选帧。 */
  frames: ExtractedFrame[];
  durationSec: number;
  /** 帧间差异聚类出的场景段（与关键帧的 sceneIndex 对应）。 */
  scenes: SceneSegment[];
  /** 采样到的候选帧总数（关键帧从这里面挑）。 */
  candidateCount: number;
};

const MAX_FRAMES = 40;
const MAX_EDGE = 480;

// ---------------------------------------------------------------------------
// v4.75 场景分段（帧间差异轻量聚类）：候选帧按时间序排列，相邻帧
// 的平均像素差 diffScore 超过阈值处即场景边界。阈值双轨：绝对
// 0.30（硬切镜头的典型量级）或自适应（≥ 均值 + 1.6 倍标准差且
// ≥ 0.14，捞光线/机位明显变化的软切）。边界秒数取相邻两候选帧
// 时间的中点，不把一句话、一个动作拦腰切断的精度就到候选帧间
// 隔（约 1.5 秒）为止——窗界再经窗间重叠兜底。
// ---------------------------------------------------------------------------
export function segmentScenes(
  candidates: { timeSec: number; diffScore: number }[],
  durationSec: number,
): SceneSegment[] {
  if (candidates.length === 0) return [];
  const diffs = candidates.slice(1).map((c) => c.diffScore);
  const mean =
    diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  const variance =
    diffs.length > 0
      ? diffs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / diffs.length
      : 0;
  const adaptive = Math.max(0.14, mean + 1.6 * Math.sqrt(variance));
  const isBoundary = (d: number) => d >= 0.3 || d >= adaptive;
  const scenes: SceneSegment[] = [];
  let firstIdx = 0;
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (c && isBoundary(c.diffScore)) {
      const prev = candidates[i - 1];
      scenes.push({
        startSec:
          scenes.length === 0
            ? 0
            : (scenes[scenes.length - 1]?.endSec ?? 0),
        endSec: prev ? (prev.timeSec + c.timeSec) / 2 : c.timeSec,
        firstIdx,
        lastIdx: i - 1,
      });
      firstIdx = i;
    }
  }
  scenes.push({
    startSec: scenes.length === 0 ? 0 : (scenes[scenes.length - 1]?.endSec ?? 0),
    endSec: durationSec,
    firstIdx,
    lastIdx: candidates.length - 1,
  });
  return scenes;
}

// ---------------------------------------------------------------------------
// v4.75 关键帧挑选：总目标约为候选帧数的 1/4（上限仍 40 帧封顶，
// 下限每场景至少 1 张）。每场景先挑分数最高的一张保底，再按场
// 景候选数从多到少把剩余额度分给各场景的次优帧。分数 = 人脸优
// 先（检出人脸直接置顶）+ 清晰度——模糊帧、空镜帧分数低，自然
// 被挤掉，不再送 AI。
// ---------------------------------------------------------------------------
export function selectKeyframeIndices(
  candidates: { sharpness: number; hasFace: boolean }[],
  scenes: SceneSegment[],
): number[] {
  if (candidates.length === 0 || scenes.length === 0) return [];
  const target = Math.max(
    scenes.length,
    Math.min(MAX_FRAMES, Math.round(candidates.length / 4)),
  );
  const score = (i: number) => {
    const c = candidates[i];
    if (!c) return -1;
    return (c.hasFace ? 1_000_000 : 0) + c.sharpness;
  };
  const picked = new Set<number>();
  // 每场景内按分数排好的候选队列。
  const queues = scenes.map((s) => {
    const idxs: number[] = [];
    for (let i = s.firstIdx; i <= s.lastIdx && i < candidates.length; i++) {
      idxs.push(i);
    }
    return idxs.sort((a, b) => score(b) - score(a));
  });
  for (const q of queues) {
    const first = q.shift();
    if (first !== undefined) picked.add(first);
  }
  // 剩余额度优先给候选多的场景（内容密的场景多给一两张）。
  const bySize = queues
    .map((q, si) => ({ q, size: q.length, si }))
    .sort((a, b) => b.size - a.size);
  let progressed = true;
  while (picked.size < target && progressed) {
    progressed = false;
    for (const { q } of bySize) {
      if (picked.size >= target) break;
      const next = q.shift();
      if (next !== undefined) {
        picked.add(next);
        progressed = true;
      }
    }
  }
  return [...picked].sort((a, b) => a - b);
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function waitEvent(
  el: HTMLVideoElement,
  okEvent: string,
  ms: number,
  timeoutMessage: string,
): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      const onOk = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error("视频加载失败（链接可能已失效，或格式不受支持）"));
      };
      const cleanup = () => {
        el.removeEventListener(okEvent, onOk);
        el.removeEventListener("error", onErr);
      };
      el.addEventListener(okEvent, onOk);
      el.addEventListener("error", onErr);
    }),
    ms,
    timeoutMessage,
  );
}

/**
 * 抽帧前快速探活一条直链（v4.71）：发一个带 5 秒超时的 HEAD 请求。
 * - "expired"：对方明确回 403（快手过期直链的典型回法），或请求
 *   超时没等到响应 —— 调用方直接走纯文本降级，不再试抽帧；
 * - "ok"：链接活着（2xx/3xx），照常抽帧；
 * - "unknown"：探不准（网络错误、对方不支持 HEAD 等）—— 不冤枉
 *   链接，照常试抽帧，由抽帧本身的成败定降级。
 */
export async function probeVideoLink(
  videoUrl: string,
  timeoutMs = 5000,
): Promise<"ok" | "expired" | "unknown"> {
  const url = videoUrl.trim();
  if (!url) return "unknown";
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: ctl.signal,
      cache: "no-store",
    });
    if (res.status === 403) return "expired";
    if (res.ok) return "ok";
    // 405 = 对方不收 HEAD、探不准；其余 4xx/5xx 多半是链接已死，
    // 按过期处理免得用户白等抽帧超时（404 尤其就是没了）。
    if (res.status === 405) return "unknown";
    if (res.status >= 400) return "expired";
    return "ok";
  } catch (e) {
    // AbortError = 超时（brief 口径：超时直接降级）；其余网络错误
    // （含跨域拦截）探不准，交给抽帧本身判定。
    if (e instanceof DOMException && e.name === "AbortError") return "expired";
    return "unknown";
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 预检专用：只抽 1 帧试视频可读性（v4.73 预检再扣费）。加载元数据
 * 后 seek 到约 10% 处截一帧，能截出非空图即算可读；返回视频时长。
 * 失败抛错并写清原因（链接失效 / 跨域无 CORS / 文件读不出），由调
 * 用方决定降级纯文本还是拦下。逻辑与 extractVideoFrames 同口径，
 * 只是只截一帧、超时更短（预检整体约 5 秒的预算）。
 */
export async function extractOneFrame(
  source: string | File,
): Promise<{ durationSec: number }> {
  let url: string;
  let objectUrl: string | null = null;
  if (typeof source !== "string") {
    if (source.size <= 0) throw new Error("选的本地视频文件是空的");
    objectUrl = URL.createObjectURL(source);
    url = objectUrl;
  } else {
    url = source.trim();
    if (!url) throw new Error("没有视频文件链接");
  }
  const video = document.createElement("video");
  if (!objectUrl) video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitEvent(video, "loadedmetadata", 12_000, "视频元数据 12 秒没加载出来（链接可能已失效或网络太慢）");
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("读不到视频时长（可能是直播流或链接已失效）");
    }
    const t = Math.min(duration * 0.1, Math.max(0.5, duration - 0.5));
    video.currentTime = t;
    await waitEvent(video, "seeked", 8_000, "预检抽帧时视频卡住了");
    const canvas = document.createElement("canvas");
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
    canvas.width = Math.max(2, Math.round(vw * scale));
    canvas.height = Math.max(2, Math.round(vh * scale));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("浏览器画布不可用，抽不了帧");
    g.drawImage(video, 0, 0, canvas.width, canvas.height);
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/jpeg", 0.62);
    } catch {
      throw new Error("视频跨域且对方没开 CORS，帧图被浏览器拦下（视频能播、但截不了图）");
    }
    if (dataUrl.length < 200) throw new Error("预检抽到的帧是空图，视频可能读不完整");
    return { durationSec: Math.round(duration * 10) / 10 };
  } finally {
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      // 卸载失败不影响结果
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function extractVideoFrames(
  source: string | File,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractResult> {
  // 本地文件走 object URL（同源 blob:，不设 crossOrigin 也不会污染
  // canvas）；字符串来源沿用原口径（跨域直链需 CORS 才能截帧）。
  let url: string;
  let objectUrl: string | null = null;
  if (typeof source !== "string") {
    if (source.size <= 0) throw new Error("选的本地视频文件是空的");
    objectUrl = URL.createObjectURL(source);
    url = objectUrl;
  } else {
    url = source.trim();
    if (!url) throw new Error("没有视频文件链接");
  }
  const video = document.createElement("video");
  if (!objectUrl) video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitEvent(video, "loadedmetadata", 20_000, "视频元数据 20 秒没加载出来（链接可能已失效或网络太慢）");
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("读不到视频时长（可能是直播流或链接已失效）");
    }
    // v4.75：先按约 1.5 秒一帧采样「候选帧」（上限 40 张），逐帧
    // 算清晰度 / 帧间差异 / 人脸，再按场景挑关键帧（约 1/4）才送
    // AI——不再把 40 张机械均匀帧全发出去。采样密度不变，所以场
    // 景边界精度与人物看清程度不降，省掉的是模糊帧与空镜帧。
    const count = Math.max(2, Math.min(MAX_FRAMES, Math.floor(duration / 1.5) || 2));
    const canvas = document.createElement("canvas");
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
    canvas.width = Math.max(2, Math.round(vw * scale));
    canvas.height = Math.max(2, Math.round(vh * scale));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("浏览器画布不可用，抽不了帧");
    // 度量画布：固定 64×36 灰度小图，清晰度（拉普拉斯方差）与帧
    // 间差异（平均像素差）都在它上面算，便宜且口径一致。
    const MW = 64;
    const MH = 36;
    const mCanvas = document.createElement("canvas");
    mCanvas.width = MW;
    mCanvas.height = MH;
    const mg = mCanvas.getContext("2d", { willReadFrequently: true });
    if (!mg) throw new Error("浏览器画布不可用，抽不了帧");
    // 人脸优先：浏览器自带 FaceDetector（Shape Detection API）
    // 可用就用，不可用 / 报错就关掉这一维，只按清晰度挑——不让
    // 挑帧因为一个人脸接口整单失败。
    let faceDetector: { detect: (s: CanvasImageSource) => Promise<unknown[]> } | null =
      null;
    try {
      const Ctor = (
        window as unknown as {
          FaceDetector?: new (opts?: object) => {
            detect: (s: CanvasImageSource) => Promise<unknown[]>;
          };
        }
      ).FaceDetector;
      if (Ctor) faceDetector = new Ctor({ fastMode: true, maxDetectedFaces: 4 });
    } catch {
      faceDetector = null;
    }
    type Candidate = ExtractedFrame & {
      sharpness: number;
      diffScore: number;
      hasFace: boolean;
    };
    const candidates: Candidate[] = [];
    let prevGray: Float32Array | null = null;
    for (let i = 0; i < count; i++) {
      // 帧点均匀分布在 (0, duration) 内，避开正好 0 与正好结尾。
      const t = (duration * (i + 0.5)) / count;
      video.currentTime = t;
      await waitEvent(video, "seeked", 10_000, `抽第 ${i + 1} 帧时视频卡住了`);
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL("image/jpeg", 0.62);
      } catch {
        throw new Error("视频跨域且对方没开 CORS，帧图被浏览器拦下（视频能播、但截不了图）");
      }
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      if (base64.length < 100) throw new Error(`第 ${i + 1} 帧是空图，抽帧失败`);
      // 度量：灰度化 → 帧间差异（对上一候选帧）+ 清晰度（拉普拉斯方差）。
      mg.drawImage(video, 0, 0, MW, MH);
      const px = mg.getImageData(0, 0, MW, MH).data;
      const gray = new Float32Array(MW * MH);
      for (let p = 0; p < MW * MH; p++) {
        const o = p * 4;
        gray[p] = 0.299 * (px[o] ?? 0) + 0.587 * (px[o + 1] ?? 0) + 0.114 * (px[o + 2] ?? 0);
      }
      let diffScore = 0;
      if (prevGray) {
        let acc = 0;
        for (let p = 0; p < gray.length; p++) {
          acc += Math.abs((gray[p] ?? 0) - (prevGray[p] ?? 0));
        }
        diffScore = acc / gray.length / 255;
      }
      prevGray = gray;
      let lapMean = 0;
      const lapVals: number[] = [];
      for (let y = 1; y < MH - 1; y++) {
        for (let x = 1; x < MW - 1; x++) {
          const idx = y * MW + x;
          const lap =
            4 * (gray[idx] ?? 0) -
            (gray[idx - 1] ?? 0) -
            (gray[idx + 1] ?? 0) -
            (gray[idx - MW] ?? 0) -
            (gray[idx + MW] ?? 0);
          lapVals.push(lap);
          lapMean += lap;
        }
      }
      lapMean = lapVals.length > 0 ? lapMean / lapVals.length : 0;
      let lapVar = 0;
      for (const v of lapVals) lapVar += (v - lapMean) * (v - lapMean);
      const sharpness = lapVals.length > 0 ? lapVar / lapVals.length : 0;
      let hasFace = false;
      if (faceDetector) {
        try {
          const faces = await faceDetector.detect(canvas);
          hasFace = Array.isArray(faces) && faces.length > 0;
        } catch {
          faceDetector = null;
        }
      }
      candidates.push({
        dataBase64: base64,
        mimeType: "image/jpeg",
        timeSec: Math.round(t * 10) / 10,
        sharpness: Math.round(sharpness * 10) / 10,
        diffScore: Math.round(diffScore * 1000) / 1000,
        hasFace,
      });
      onProgress?.(candidates.length, count);
    }
    if (candidates.length === 0) throw new Error("一帧都没抽出来");
    const durationSec = Math.round(duration * 10) / 10;
    const scenes = segmentScenes(candidates, durationSec);
    const picks = selectKeyframeIndices(candidates, scenes);
    const frames: ExtractedFrame[] = picks.map((ci) => {
      const c = candidates[ci];
      const sceneIndex = scenes.findIndex(
        (s) => ci >= s.firstIdx && ci <= s.lastIdx,
      );
      return {
        dataBase64: c?.dataBase64 ?? "",
        mimeType: "image/jpeg" as const,
        timeSec: c?.timeSec ?? 0,
        sharpness: c?.sharpness,
        diffScore: c?.diffScore,
        hasFace: c?.hasFace,
        sceneIndex: sceneIndex >= 0 ? sceneIndex : 0,
      };
    });
    if (frames.length === 0) throw new Error("一帧都没抽出来");
    return { frames, durationSec, scenes, candidateCount: candidates.length };
  } finally {
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      // 卸载失败不影响结果
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** 「2分13秒 / 1分5秒 / 45秒 / 2:13」这类时长文本换算成秒；看不懂回 0。 */
export function parseDurationTextToSeconds(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  const colon = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const a = Number(colon[1]);
    const b = Number(colon[2]);
    const c = colon[3] ? Number(colon[3]) : 0;
    return colon[3] ? a * 3600 + b * 60 + c : a * 60 + b;
  }
  let total = 0;
  const min = s.match(/(\d+(?:\.\d+)?)\s*分/);
  const sec = s.match(/(\d+(?:\.\d+)?)\s*秒/);
  if (min) total += Number(min[1]) * 60;
  if (sec) total += Number(sec[1]);
  if (total > 0) return Math.round(total * 10) / 10;
  const plain = Number(s);
  return Number.isFinite(plain) && plain > 0 ? plain : 0;
}
