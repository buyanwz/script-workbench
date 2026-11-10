// ---------------------------------------------------------------------------
// 共用预览图组件（v3.64 建，v3.66 加固坏预览与失败态，v3.68 无卡顿，
// v5.57 预览统一降质）：打开工作台就要能显示图片、滚动不卡。卡面规则：
//   - v5.57 降质口径：预览统一最长边 ≤480px、JPEG 质量 0.68（服务端
//     特权层同口径 480 / quality 68）。720px 时代存下的旧预览在卡面
//     加载后被识别为「超规格」，后台按新规格限流重生成一张覆盖它
//     （每引用每会话至多一次），之后打开页面只下小图；点开大图 /
//     下载 / 设图等明确动作仍走原图全质，不经本组件。
//   - 卡面只加载 ≤480px 预览图，绝不用原图做卡面显示。原图只在
//     「预览存在但加载失败」时回落显示，以及点开大图 / 下载 / 设图
//     等明确动作里用（那些走调用方自己的原图地址，不经本组件）。
//   - 没有预览的老图：不再像旧版那样直接把几 MB 的原图塞进卡面
//     <img>（首屏几十张原图同时下载 + 主线程解码大图 = 打开慢、
//     滚动卡）。现在卡面先显示骨架占位，后台限流（最多 2 个并发、
//     按进入视口先后）把原图取回、缩成 ≤480px JPEG 回存服务端，
//     拿到预览地址后换上小图；回存成功同时回调 onBackfilled 让
//     列表刷新。补生成失败才回落原图显示（懒加载），不留空白。
//   - 补生成取图优先 fetch + createImageBitmap（解码不占主线程），
//     不可用时回落 scriptlib 的 urlToThumbnail（canvas 路径）。
//   - 首屏关键图传 eager：loading=eager + fetchPriority=high 立即
//     加载；其余懒加载，且缺预览的补生成要等卡片进入视口附近
//     （IntersectionObserver，提前 400px）才启动，视口外零请求、
//     滚动不阻塞。
//   - 已生成的预览地址按引用缓存在本会话内（ensureCache），列表
//     刷新 / 切窗口回来直接命中，不重复下载原图、不重复补生成；
//     服务端预览本身走稳定 blob 地址，浏览器 HTTP 缓存跨刷新复用。
//   - 坏预览识别（v3.66）：预览加载「成功」但自然尺寸 ≤2px（曾有
//     1×1 白图占位）直接判坏——回落原图，并强制重新补生成真预览
//     覆盖它（服务端也会拒绝小尺寸预览，双保险）。
//   - 明确状态，不留空白白板：加载中是骨架色 + 脉冲动画；预览与
//     原图都失败时显示「图片加载失败，点击重试」按钮（写清失败
//     的是哪类地址），点它重新请求。无图根本走不到这个组件
//     （调用方渲染「暂无图片」占位），两者不混。
// ---------------------------------------------------------------------------

import {
useEffect,
useRef,
useState,
type ImgHTMLAttributes,
type MouseEvent as ReactMouseEvent,
} from "react";
import { api } from "./api";
import { urlToThumbnail } from "./scriptlib";

export type PreviewRef =
  | { kind: "presetImage"; imageId: number }
  | { kind: "character"; characterId: number }
  | { kind: "sceneAsset"; sceneAssetId: number }
  | { kind: "staged"; stagedKey: string };

/** v5.57 预览降质规格：最长边 ≤480px、JPEG 质量 0.68（服务端特权层
 * 同口径 480 / quality 68）。卡面显示框最大不过 ~300px，480 仍留
 * 2 倍余量，人脸与服装细节可辨；比 720 / 0.82 单张约少六成字节。 */
export const PREVIEW_MAX_EDGE = 480;
export const PREVIEW_JPEG_QUALITY = 0.68;

function refKey(r: PreviewRef): string {
  switch (r.kind) {
    case "presetImage":
      return `presetImage:${r.imageId}`;
    case "character":
      return `character:${r.characterId}`;
    case "sceneAsset":
      return `sceneAsset:${r.sceneAssetId}`;
    case "staged":
      return `staged:${r.stagedKey}`;
  }
}

// ---- 补生成：会话级缓存 + 限流队列 -------------------------------------
// 同一引用只补一次：成功记住预览地址，之后任何卡片再挂载直接用；
// 进行中的请求合并成一个 Promise，不重复下载原图。
const ensureCache = new Map<string, string>();
const ensurePending = new Map<string, Promise<string | null>>();
const MAX_BACKFILL_RUNNING = 2;
let backfillRunning = 0;
const backfillWaiters: Array<() => void> = [];

function acquireBackfillSlot(): Promise<void> {
  if (backfillRunning < MAX_BACKFILL_RUNNING) {
    backfillRunning += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    backfillWaiters.push(() => {
      backfillRunning += 1;
      resolve();
    });
  });
}

function releaseBackfillSlot(): void {
  backfillRunning -= 1;
  const next = backfillWaiters.shift();
  if (next) next();
}

/**
 * 把原图缩成 ≤480px JPEG（v5.57 规格）：优先 fetch +
 * createImageBitmap（解码在浏览器内部线程完成，不把几千像素大图
 * 的解码压到主线程上）；该 API 不可用或失败时回落 canvas 路径
 * （urlToThumbnail）。
 */
async function makeThumbnailData(
  src: string,
): Promise<{ dataBase64: string; mimeType: string } | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const res = await fetch(src);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      try {
        if (bmp.width < 16 || bmp.height < 16) return null;
        const scale = Math.min(
          1,
          PREVIEW_MAX_EDGE / Math.max(bmp.width, bmp.height),
        );
        const w = Math.max(1, Math.round(bmp.width * scale));
        const h = Math.max(1, Math.round(bmp.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const cx = canvas.getContext("2d");
        if (!cx) return null;
        cx.fillStyle = "#ffffff";
        cx.fillRect(0, 0, w, h);
        cx.drawImage(bmp, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", PREVIEW_JPEG_QUALITY);
        const comma = dataUrl.indexOf(",");
        if (comma < 0) return null;
        return { dataBase64: dataUrl.slice(comma + 1), mimeType: "image/jpeg" };
      } finally {
        bmp.close();
      }
    }
  } catch {
    /* 回落 canvas 路径 */
  }
  const t = await urlToThumbnail(
    src,
    "卡面预览补存",
    PREVIEW_MAX_EDGE,
    PREVIEW_JPEG_QUALITY,
  );
  return t ? { dataBase64: t.dataBase64, mimeType: t.mimeType } : null;
}

/** 确保某个引用有一张真预览：命中缓存直接返回，否则限流补生成。 */
function ensurePreview(
  ref: PreviewRef,
  src: string,
  force: boolean,
): Promise<string | null> {
  const key = refKey(ref);
  if (force) {
    ensureCache.delete(key);
    ensurePending.delete(key);
  }
  const cached = ensureCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = ensurePending.get(key);
  if (pending) return pending;
  const p = (async (): Promise<string | null> => {
    await acquireBackfillSlot();
    try {
      const t = await makeThumbnailData(src);
      if (!t) return null;
      const r = await api.saveImagePreview({
        ref,
        dataBase64: t.dataBase64,
        mimeType: "image/jpeg",
      });
      ensureCache.set(key, r.previewUrl);
      return r.previewUrl;
    } catch {
      return null;
    } finally {
      releaseBackfillSlot();
      ensurePending.delete(key);
    }
  })();
  ensurePending.set(key, p);
  return p;
}

// ---- v5.57 旧预览降规格重生成 -------------------------------------------
// 720px 时代存下的预览不会自己变小：卡面图加载完量到自然尺寸超
// 480px 时，后台按新规格强制重生成一张覆盖它（走同一条限流队列、
// 同一条 saveImagePreview 回存通道，预览地址不变、原图一字不动）。
// 每引用每会话至多触发一次，失败静默（卡面照旧显示，下次打开再
// 试）。非 PreviewImg 的预览位（如封面记录里按钮内的裸 img，不能
// 嵌本组件的失败态按钮）也在 onLoad 里调这个助手，口径一致。
const regenAttempted = new Set<string>();

export function regenerateOversizedPreview(
  ref: PreviewRef,
  src: string,
  onDone?: () => void,
): void {
  const key = refKey(ref);
  if (regenAttempted.has(key)) return;
  regenAttempted.add(key);
  void ensurePreview(ref, src, true).then((url) => {
    if (url) onDone?.();
  });
}

// ---- 组件 ---------------------------------------------------------------

type Props = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onLoad" | "onError"
> & {
  /** 原图地址（完整原图，只作回落与补生成来源）。 */
  src: string;
  /** 预览图地址；null = 还没有预览。 */
  previewSrc?: string | null;
  /** 老图补生成的引用目标；不传则只回落显示、不补生成。 */
  previewRef?: PreviewRef;
  /** 补生成成功后调用（一般是让所在列表失效刷新出 previewUrl）。 */
  onBackfilled?: () => void;
  /** 首屏关键图可设 eager，其余一律懒加载。 */
  eager?: boolean;
};

export function PreviewImg({
  src,
  previewSrc,
  previewRef,
  onBackfilled,
  eager,
  alt,
  className,
  style,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  ...rest
}: Props) {
  const [fellBack, setFellBack] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 失败态：预览与原图都加载不出来时才出现；记录失败的是哪类地址。
  const [failed, setFailed] = useState<null | {
    stage: "原图" | "预览图与原图";
  }>(null);
  const [attempt, setAttempt] = useState(0);
  // 本次挂载内补生成拿到的预览地址（列表刷新前先顶上，不等整表）。
  const [ensuredUrl, setEnsuredUrl] = useState<string | null>(null);
  // 缺预览时是否已决定回落原图（补生成失败 / 判坏后强制补仍失败）。
  const [gaveUp, setGaveUp] = useState(false);
  // 卡片是否已进入视口附近（懒卡补生成的启动闸门）。
  const [nearViewport, setNearViewport] = useState(Boolean(eager));
  const holderRef = useRef<HTMLDivElement | null>(null);

  const effectivePreview = previewSrc ?? ensuredUrl;
  const showingPreview = Boolean(effectivePreview) && !fellBack;
  // 缺预览且能补生成、还没放弃：先骨架占位，不拿原图做卡面。
  const awaitingPreview =
    !effectivePreview && Boolean(previewRef) && !gaveUp && !fellBack;

  // 原图地址换了（同一组件位置换了张图）时重置本地状态；只变
  // previewSrc 不重置——补生成成功后列表刷新带回同一个预览地址，
  // 图片本身没变，清掉已加载状态会让它卡在脉冲占位上。
  const prevSrcRef = useRef(src);
  if (prevSrcRef.current !== src) {
    prevSrcRef.current = src;
    // 渲染期同步重置：不用 effect，避免先闪一帧旧图。
    if (loaded) setLoaded(false);
    if (ensuredUrl) setEnsuredUrl(null);
    if (gaveUp) setGaveUp(false);
    if (fellBack) setFellBack(false);
    if (failed) setFailed(null);
  }

  // 视口闸门：骨架占位进入视口附近才开始补生成。
  useEffect(() => {
    if (!awaitingPreview || nearViewport) return;
    const el = holderRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setNearViewport(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [awaitingPreview, nearViewport]);

  // 补生成：进入视口附近后限流执行；成功换上预览并通知列表刷新，
  // 失败回落原图（懒加载显示），不留空白。
  useEffect(() => {
    if (!awaitingPreview || !nearViewport || !previewRef) return;
    let cancelled = false;
    void ensurePreview(previewRef, src, false).then((url) => {
      if (cancelled) return;
      if (url) {
        setEnsuredUrl(url);
        onBackfilled?.();
      } else {
        setGaveUp(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // onBackfilled 由调用方以 invalidate 等稳定回调传入，不入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingPreview, nearViewport, previewRef, src]);

  const handleLoad = (e: { currentTarget: HTMLImageElement }) => {
    const img = e.currentTarget;
    if (showingPreview) {
      // 坏预览（1×1 白图占位）：加载「成功」但尺寸是假的——回落
      // 原图显示，并强制重新补生成一张真预览覆盖它。
      if (img.naturalWidth <= 2 || img.naturalHeight <= 2) {
        setFellBack(true);
        setLoaded(false);
        if (previewRef) {
          void ensurePreview(previewRef, src, true).then((url) => {
            if (url) onBackfilled?.();
          });
        }
        return;
      }
      // v5.57：720 时代的旧预览超新规格——后台按 480 / 0.68 重生成
      // 覆盖，本次显示不受影响，之后打开只下小图。
      if (
        Math.max(img.naturalWidth, img.naturalHeight) > PREVIEW_MAX_EDGE &&
        previewRef
      ) {
        regenerateOversizedPreview(previewRef, src, onBackfilled);
      }
      setLoaded(true);
      return;
    }
    setLoaded(true);
  };

  const handleError = () => {
    if (showingPreview) {
      // 预览图本身坏了才回落原图。
      setFellBack(true);
      setLoaded(false);
      return;
    }
    // 原图也加载不出来：明确失败态，不留空白。
    setFailed({
      stage: effectivePreview ? "预览图与原图" : "原图",
    });
  };

  const retry = (e: ReactMouseEvent) => {
    e.stopPropagation();
    setFailed(null);
    setFellBack(false);
    setLoaded(false);
    setGaveUp(false);
    setEnsuredUrl(null);
    setAttempt((a) => a + 1);
  };

  if (failed) {
    return (
      <button
        type="button"
        className={`${className ?? ""} flex flex-col items-center justify-center gap-0.5 overflow-hidden text-center`}
        style={{
          ...style,
          background: "var(--surface-alt)",
          color: "var(--bad)",
          cursor: "pointer",
        }}
        onClick={retry}
        aria-label={`${alt || "图片"}加载失败，点击重试`}
      >
        <span className="px-1 text-[11px] font-semibold leading-4">
          图片加载失败，点击重试
        </span>
        <span
          className="px-1 text-[10px] leading-3.5"
          style={{ color: "var(--dim)" }}
        >
          {failed.stage}地址打不开
        </span>
      </button>
    );
  }

  if (awaitingPreview) {
    return (
      <div
        ref={holderRef}
        role="img"
        aria-label={alt ? `${alt}（加载中）` : "图片加载中"}
        aria-busy="true"
        data-img-state="loading"
        className={`${className ?? ""} animate-pulse flex items-center justify-center overflow-hidden`}
        style={{ ...style, backgroundColor: "var(--surface-alt)" }}
      >
        <span className="text-[11px]" style={{ color: "var(--dim)" }}>
          图片加载中…
        </span>
      </div>
    );
  }

  const shown = showingPreview ? (effectivePreview as string) : src;
  return (
    <img
      {...rest}
      key={attempt}
      src={shown}
      alt={alt ?? ""}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "low"}
      decoding="async"
      aria-busy={!loaded}
      data-img-state={loaded ? "shown" : "loading"}
      className={`${className ?? ""}${loaded ? "" : " animate-pulse"}`}
      style={{
        ...style,
        ...(loaded ? {} : { backgroundColor: "var(--surface-alt)" }),
      }}
      onLoad={handleLoad}
      onError={handleError}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    />
  );
}
