// 生成视频 · 牢络生成平台的接入 wrapper（v6.48 接入，v6.49 修黑屏，
// v6.50 加加载诊断面板 + 新窗口备用入口）
//
// 平台本体是一个完整独立的单元（client/src/laoluo/source.html），经
// laoluo/prepare.mjs 转换（剥离内嵌 Token + 注入诊断脚本）后生成同
// 目录的 platform.html，打包时作为 assets 静态资源发出。本模块只
// 负责四件事，与平台本体严格分离：
//   1. 打开总线 openVideoGenPanel（与生图的 openImageGenPanel 同制式），
//      顶栏「生成视频」按钮调它；
//   2. 全页覆盖窗口：打开时锁背景滚动，带明确的「关闭」入口，关掉
//      回到工作台，工作台状态不受影响；头部另有「新窗口打开」按钮；
//   3. 同源 iframe 承载平台：平台的全局样式只作用于 iframe 内部、
//      它的 JS 只操作自己的 document，不碰工作台的 DOM 与状态；
//      同源保证平台的 localStorage（llpub-*）、IndexedDB、下载与
//      剪贴板都正常工作；
//   4. 加载诊断（v6.50）：把平台加载拆成四个可观测阶段（iframe 导航
//      → 诊断脚本 boot → 挂载观测 → app-ready 渲染确认），任一阶段
//      卡住时窗口内出现诊断面板，写清卡在哪一步、抓到什么错，并给
//      「复制全部诊断 / 重新挂载 / 新窗口打开」三个按钮，绝不静默
//      黑屏。面板由 wrapper 自己的定时器驱动（15 秒硬截止），不依赖
//      iframe 的任何事件——v6.49 的错误层在用户真机上没出现过，本版
//      专门堵这个缺口：哪怕 iframe 的 load 永不触发，面板也必出现。
//
// v6.49 承载方式改版（黑屏根因修复）：v6.48 用 srcDoc 把整份 HTML
// 当字符串塞进 iframe——srcDoc 文档会继承工作台页面的内容安全策略
// （CSP），线上工作台页面的 script-src 不允许内联脚本，平台的那段
// 内联 <script> 被浏览器整段拦下、#app 一直是空的，窗口里只剩平台
// 自己的黑底（用户真机截图：头部正常、内容全黑；沙箱审计环境没有
// 这条 CSP，所以当时探针看着渲染正常）。改成 iframe src 指向独立
// 文档地址（platform.html 静态资源）后，平台文档只受它自己响应头
// 的策略约束，不再被工作台页面 CSP 连累；blob: 地址同样继承创建者
// 的 CSP，实测一样黑，不能用。复现与逐项排查记录见 DATA-PLAN v6.49 条。
//
// v6.50 诊断上报通道：prepare.mjs 把 laoluo/diagnostics.js 内联注入
// platform.html 的 <head>（跑在平台主程序之前），子页面通过
// postMessage（固定 channel "laoluo-diag" + build 标识）上报 boot /
// app-ready / render-timeout / error / csp 五类消息；本模块校验
// event.source（必须是本 iframe 的 contentWindow）与 event.origin
// （必须是工作台自身来源或平台资源来源）后才采信。为什么诊断脚本
// 用内联不用外联：platform.html 打包后是带内容哈希的资源名，外联
// 诊断文件同样会被改成哈希名，而 prepare.mjs 在打包前运行、算不出
// 哈希，写死的相对地址必然对不上；内联是这条管线里唯一可重复的
// 做法。若平台文档自身 CSP 连内联脚本都拦，诊断脚本同样跑不起来，
// 但「已导航、无 boot」本身就是明确信号（平台主程序同为内联脚本），
// 面板会照实显示卡在该阶段。注入细节见 laoluo/diagnostics.js 文件头。
//
// 父页面自身的 securitypolicyviolation（例如 frame-src 拦下 iframe
// 导航）由本模块直接监听 document 并记进面板；子页面文档内的违规
// 由诊断脚本捕获后上报，两路都汇到同一份诊断里。
//
// iframe 地址带 build 缓存戳（?llb=<build>-<attempt>），避免真机拿
// 到旧版平台文件；「新窗口打开」用同一地址 window.open（noopener），
// 绕开 iframe 嵌入层——新窗口能开、窗内开不了，就说明问题在嵌入层。
// iframe 首次打开后保持挂载（只切换可见性），平台里正在跑的演示 /
// 轮询不会因关窗被打断，平台自身状态本来也都存在它自己的本机存储里。
// 换平台新版只换 laoluo/source.html 并重跑 prepare.mjs，本文件不用动
// （流程见 laoluo/README.md）。

import { useEffect, useRef, useState } from "react";
// 打包时作为 assets 静态资源发出的独立文档地址（见文件头注释）：
// Bun 文件资源导入，打包器把 platform.html 发到 assets 并回填地址字符串；
// bun-types 把 *.html 导入标成 HTMLBundle，这里按文件资源导入的实际
// 运行时值（地址字符串）收口类型。
import laoluoPlatformAsset from "./laoluo/platform.html" with { type: "file" };
const LAOLUO_PLATFORM_URL: string = laoluoPlatformAsset as unknown as string;

let openListener: (() => void) | null = null;
export function openVideoGenPanel() {
  openListener?.();
}

type LoadStatus = "loading" | "ready" | "error";

/** 诊断通道标识：与 laoluo/diagnostics.js 里的 CHANNEL / BUILD 一致。 */
const DIAG_CHANNEL = "laoluo-diag";
const DIAG_BUILD = "v6.50";

/** 渲染确认轮询间隔（wrapper 侧观测，与子页面诊断脚本的观测并行）。 */
const RENDER_POLL_MS = 500;
/** 诊断面板硬截止：挂载后超过这个时间还没确认渲染，面板必须出现。
    由 wrapper 自己的 setTimeout 驱动，不依赖 iframe 任何事件。 */
const PANEL_DEADLINE_MS = 15000;

/** 带 build 缓存戳的平台地址：每次重新挂载（attempt 变化）都换戳。 */
function platformUrlFor(attempt: number): string {
  const sep = LAOLUO_PLATFORM_URL.includes("?") ? "&" : "?";
  return LAOLUO_PLATFORM_URL + sep + "llb=" + DIAG_BUILD + "-" + attempt;
}

type ChildError = {
  message: string;
  filename: string;
  lineno: number;
  colno: number;
  at: number;
};
type CspHit = { source: string; directive: string; blockedURI: string; at: number };
type BootInfo = {
  storage: string;
  vw: number;
  vh: number;
  ua: string;
  path: string;
  at: number;
};
type RenderInfo = { children: number; w: number; h: number };

type DiagState = {
  /** 本轮挂载开始时刻（ms）。 */
  startedAt: number;
  /** 阶段 1：iframe load 事件时刻；null = 未触发。 */
  navAt: number | null;
  /** 阶段 2：诊断脚本 boot（含存储探查 / 视口 / UA）；null = 未收到。 */
  boot: BootInfo | null;
  /** 阶段 3：挂载观测——wrapper 轮询或子页面观测最后看到的 #app 状态。 */
  observed: (RenderInfo & { appExists: boolean; at: number }) | null;
  /** 阶段 4：app-ready 时刻与渲染信息；null = 未确认。 */
  readyAt: number | null;
  readyInfo: RenderInfo | null;
  /** 子页面诊断脚本报的 render-timeout 时的最后观测状态。 */
  childTimeout: (RenderInfo & { appExists: boolean }) | null;
  /** 子页面捕获的脚本 / 异步 / 资源错误。 */
  errors: ChildError[];
  /** CSP 违规：子页面文档内（诊断脚本报）+ 工作台父页面（本模块监听）。 */
  csp: CspHit[];
};

function freshDiag(): DiagState {
  return {
    startedAt: Date.now(),
    navAt: null,
    boot: null,
    observed: null,
    readyAt: null,
    readyInfo: null,
    childTimeout: null,
    errors: [],
    csp: [],
  };
}

function stageLabel(done: boolean, isCurrent: boolean): string {
  if (done) return "已触发";
  return isCurrent ? "进行中" : "未确认";
}

export function VideoGenPanelHost() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // attempt 自增 = 重新挂载 iframe（重试用）。
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [diag, setDiag] = useState<DiagState>(() => freshDiag());
  const [copyNote, setCopyNote] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const statusRef = useRef<LoadStatus>("loading");
  statusRef.current = status;
  const diagRef = useRef<DiagState>(diag);
  diagRef.current = diag;
  // 当前已挂错误监听的平台 window（换窗时先摘旧的）。
  const hookedWinRef = useRef<{ win: Window; off: () => void } | null>(null);

  useEffect(() => {
    openListener = () => {
      setMounted(true);
      setOpen(true);
    };
    return () => {
      openListener = null;
    };
  }, []);

  // 打开时锁背景滚动（与生图悬浮窗 v6.35 同口径），关闭 / 卸载恢复原值。
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open ]);

  // Esc 关闭（焦点在平台 iframe 内时由平台自己处理它的对话框，
  // 这里只接工作台这一层的 Esc）。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  // 父页面自身的 CSP 违规监听（frame-src 等在父文档上发生的拦截）：
  // 与 iframe 是否加载无关，挂载期间一直听，记进诊断。
  useEffect(() => {
    if (!mounted) return;
    const onCsp = (e: SecurityPolicyViolationEvent) => {
      const hit: CspHit = {
        source: "工作台页面",
        directive: e.violatedDirective || e.effectiveDirective || "",
        blockedURI: String(e.blockedURI || ""),
        at: Date.now(),
      };
      console.error(
        "[生成视频] 工作台页面 CSP 违规：" + hit.directive + " " + hit.blockedURI,
      );
      setDiag((d) => ({ ...d, csp: [...d.csp.slice(-9), hit] }));
    };
    document.addEventListener("securitypolicyviolation", onCsp);
    return () => document.removeEventListener("securitypolicyviolation", onCsp);
  }, [mounted]);

  // 子页面诊断上报通道：校验来源后按类型并入诊断状态。
  useEffect(() => {
    if (!mounted) return;
    const onMessage = (e: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      let assetOrigin = "";
      try {
        assetOrigin = new URL(LAOLUO_PLATFORM_URL, window.location.href).origin;
      } catch {
        assetOrigin = "";
      }
      if (e.origin !== window.location.origin && e.origin !== assetOrigin) return;
      const data: unknown = e.data;
      if (!data || typeof data !== "object") return;
      const msg = data as Record<string, unknown>;
      if (msg.channel !== DIAG_CHANNEL || msg.build !== DIAG_BUILD) return;
      const at = typeof msg.at === "number" ? msg.at : Date.now();
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      if (msg.type === "boot") {
        setDiag((d) => ({
          ...d,
          boot: {
            storage: str(msg.storage) || "unknown",
            vw: num(msg.vw),
            vh: num(msg.vh),
            ua: str(msg.ua),
            path: str(msg.path),
            at,
          },
        }));
      } else if (msg.type === "app-ready") {
        const info: RenderInfo = {
          children: num(msg.children),
          w: num(msg.w),
          h: num(msg.h),
        };
        setDiag((d) => ({
          ...d,
          observed: { appExists: true, ...info, at },
          readyAt: d.readyAt ?? at,
          readyInfo: d.readyInfo ?? info,
        }));
        setStatus("ready");
      } else if (msg.type === "render-timeout") {
        setDiag((d) => ({
          ...d,
          childTimeout: {
            appExists: msg.appExists === true,
            children: num(msg.children),
            w: num(msg.w),
            h: num(msg.h),
          },
        }));
      } else if (msg.type === "error") {
        const err: ChildError = {
          message: str(msg.message) || "平台页面出现未知错误",
          filename: str(msg.filename),
          lineno: num(msg.lineno),
          colno: num(msg.colno),
          at,
        };
        console.error("[生成视频] 平台页面报错（诊断上报）：" + err.message);
        setDiag((d) => ({ ...d, errors: [...d.errors.slice(-9), err] }));
      } else if (msg.type === "csp") {
        const hit: CspHit = {
          source: "平台页面",
          directive: str(msg.directive),
          blockedURI: str(msg.blockedURI),
          at,
        };
        console.error(
          "[生成视频] 平台页面 CSP 违规（诊断上报）：" +
            hit.directive +
            " " +
            hit.blockedURI,
        );
        setDiag((d) => ({ ...d, csp: [...d.csp.slice(-9), hit] }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mounted]);

  // 渲染确认轮询（wrapper 侧独立观测）+ 诊断面板硬截止定时器。
  // 两者都只依赖 wrapper 自己的时钟：轮询直接读同源 iframe 文档的
  // #app 状态（子页面诊断脚本被拦时这条还活着）；截止定时器到点
  // 必把状态转 error 让面板出现，哪怕 iframe load 从未触发。
  useEffect(() => {
    if (!mounted) return;
    if (statusRef.current === "ready") return;
    let stopped = false;
    const poll = window.setInterval(() => {
      if (stopped) return;
      const frame = iframeRef.current;
      try {
        const doc = frame?.contentDocument;
        const app = doc?.getElementById("app");
        if (app) {
          const rect = app.getBoundingClientRect();
          const info: RenderInfo = {
            children: app.childElementCount,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
          setDiag((d) =>
            d.observed &&
            d.observed.children === info.children &&
            d.observed.w === info.w &&
            d.observed.h === info.h
              ? d
              : { ...d, observed: { appExists: true, ...info, at: Date.now() } },
          );
          if (info.children > 0 && info.w > 0 && info.h > 0) {
            setDiag((d) => ({
              ...d,
              readyAt: d.readyAt ?? Date.now(),
              readyInfo: d.readyInfo ?? info,
            }));
            setStatus("ready");
            window.clearInterval(poll);
          }
        }
      } catch {
        /* 跨源或文档未就绪时本轮跳过，等下一轮 */
      }
    }, RENDER_POLL_MS);
    const deadline = window.setTimeout(() => {
      if (stopped) return;
      window.clearInterval(poll);
      if (statusRef.current !== "ready") setStatus("error");
    }, PANEL_DEADLINE_MS);
    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearTimeout(deadline);
    };
  }, [mounted, attempt]);

  // 组件卸载时摘掉平台 window 的错误监听。
  useEffect(() => {
    return () => {
      hookedWinRef.current?.off();
      hookedWinRef.current = null;
    };
  }, []);

  /** 平台文档每次加载完：记导航阶段 + 把它的 window.onerror 挂上
      （同源可直达；与诊断脚本的 postMessage 上报并行，多一路兜底）。 */
  const hookPlatformWindow = () => {
    setDiag((d) => (d.navAt == null ? { ...d, navAt: Date.now() } : d));
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (hookedWinRef.current?.win === win) return;
    hookedWinRef.current?.off();
    const pushError = (message: string) => {
      console.error("[生成视频] 平台页面报错：" + message);
      setDiag((d) => ({
        ...d,
        errors: [
          ...d.errors.slice(-9),
          { message, filename: "", lineno: 0, colno: 0, at: Date.now() },
        ],
      }));
    };
    const onError = (e: ErrorEvent) => {
      pushError(e.message || "平台页面出现未知错误");
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: unknown = e.reason;
      pushError(
        reason instanceof Error ? reason.message : String(reason ?? "未知错误"),
      );
    };
    win.addEventListener("error", onError);
    win.addEventListener("unhandledrejection", onRejection);
    hookedWinRef.current = {
      win,
      off: () => {
        try {
          win.removeEventListener("error", onError);
          win.removeEventListener("unhandledrejection", onRejection);
        } catch {
          /* 平台 window 已随导航销毁时摘监听失败无妨 */
        }
      },
    };
  };

  const retry = () => {
    hookedWinRef.current?.off();
    hookedWinRef.current = null;
    setCopyNote("");
    setDiag(freshDiag());
    setStatus("loading");
    setAttempt((a) => a + 1);
  };

  const openInNewWindow = () => {
    // 必须在点击手势里直接调 window.open，弹窗拦截才不会拦。
    window.open(platformUrlFor(attempt), "_blank", "noopener");
  };

  /** 拼一份纯文本诊断（复制按钮用）：阶段、错误、违规、环境全在内。 */
  const buildDiagText = (): string => {
    const d = diagRef.current;
    const frame = iframeRef.current;
    const fmtStage = (done: boolean) => (done ? "已触发" : "未确认");
    const lines: string[] = [];
    lines.push("生成视频 · 平台加载诊断（" + DIAG_BUILD + "）");
    lines.push("时间：" + new Date().toISOString());
    lines.push("平台地址：" + platformUrlFor(attempt));
    lines.push(
      "浏览器：" + (d.boot?.ua || window.navigator.userAgent || "未知"),
    );
    lines.push(
      "页面协议：" +
        window.location.protocol +
        " / iframe 尺寸：" +
        (frame ? frame.clientWidth + "×" + frame.clientHeight : "未知") +
        " / 平台视口：" +
        (d.boot ? d.boot.vw + "×" + d.boot.vh : "未知"),
    );
    lines.push("阶段：");
    lines.push(
      "  1. iframe 导航（load 事件）：" + fmtStage(d.navAt != null),
    );
    lines.push(
      "  2. 诊断脚本启动（boot）：" +
        fmtStage(d.boot != null) +
        (d.boot ? "（本机存储探查：" + d.boot.storage + "）" : ""),
    );
    lines.push(
      "  3. 平台挂载观测：" +
        (d.observed
          ? "看到 #app（子节点 " +
            d.observed.children +
            " 个，尺寸 " +
            d.observed.w +
            "×" +
            d.observed.h +
            "）"
          : d.childTimeout
            ? "子页面观测超时，最后状态：#app " +
              (d.childTimeout.appExists ? "存在" : "不存在") +
              "、子节点 " +
              d.childTimeout.children +
              " 个、尺寸 " +
              d.childTimeout.w +
              "×" +
              d.childTimeout.h
            : "未确认"),
    );
    lines.push(
      "  4. 首次渲染确认（app-ready）：" + fmtStage(d.readyAt != null),
    );
    const lastStage = d.readyAt
      ? "4 首次渲染确认"
      : d.observed
        ? "3 平台挂载观测"
        : d.boot
          ? "2 诊断脚本启动"
          : d.navAt
            ? "1 iframe 导航"
            : "0（连导航都没确认）";
    lines.push("最后到达阶段：" + lastStage);
    if (d.errors.length > 0) {
      lines.push("捕获到的报错：");
      for (const e of d.errors) {
        lines.push(
          "  - " +
            e.message +
            (e.filename
              ? "（" + e.filename + ":" + e.lineno + ":" + e.colno + "）"
              : ""),
        );
      }
    } else {
      lines.push("捕获到的报错：无");
    }
    if (d.csp.length > 0) {
      lines.push("CSP 违规：");
      for (const c of d.csp) {
        lines.push("  - [" + c.source + "] " + c.directive + " 拦下 " + c.blockedURI);
      }
    } else {
      lines.push("CSP 违规：无");
    }
    return lines.join("\n");
  };

  const copyDiag = async () => {
    const text = buildDiagText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote("诊断信息已复制，去聊天里粘贴发出来就行。");
    } catch {
      // 剪贴板被拒时退回老办法：临时文本框选中复制。
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopyNote("诊断信息已复制，去聊天里粘贴发出来就行。");
      } catch {
        setCopyNote("复制没成功，请把面板截图发出来也行。");
      }
    }
  };

  if (!mounted) return null;

  const d = diag;
  const lastStageText = d.readyAt
    ? "第 4 步 · 首次渲染确认"
    : d.observed
      ? "第 3 步 · 平台挂载观测"
      : d.boot
        ? "第 2 步 · 诊断脚本启动"
        : d.navAt
          ? "第 1 步 · iframe 导航"
          : "还没走出第一步";
  const stages: { name: string; done: boolean; detail: string }[] = [
    {
      name: "iframe 导航（平台页面打开）",
      done: d.navAt != null,
      detail: d.navAt != null ? "页面已加载" : "还没等到加载完成",
    },
    {
      name: "诊断脚本启动（boot）",
      done: d.boot != null,
      detail: d.boot
        ? "已启动；本机存储探查：" + (d.boot.storage === "ok" ? "正常" : d.boot.storage)
        : "没收到——平台文档里的脚本可能没跑起来",
    },
    {
      name: "平台挂载观测",
      done: d.observed != null,
      detail: d.observed
        ? "#app 子节点 " + d.observed.children + " 个，尺寸 " + d.observed.w + "×" + d.observed.h
        : d.childTimeout
          ? "子页面观测超时：#app " +
            (d.childTimeout.appExists ? "存在" : "不存在") +
            "、子节点 " +
            d.childTimeout.children +
            " 个"
          : "还没观测到平台界面根节点",
    },
    {
      name: "首次渲染确认（app-ready）",
      done: d.readyAt != null,
      detail: d.readyAt != null ? "平台界面已经出来" : "界面还没出来",
    },
  ];
  const firstUndone = stages.findIndex((s) => !s.done);

  return (
    <div
      className="fixed inset-0 z-[96] flex-col"
      style={{
        display: open ? "flex" : "none",
        background: "var(--bg)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="生成视频（牢络生成平台）"
    >
      <div
        className="flex shrink-0 items-center gap-3 border-b px-3 py-2 sm:px-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <span className="text-sm font-bold text-[var(--text)]">生成视频</span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--dim)]">
          牢络生成平台 · MiniMax H3 · 密钥在平台右上角「密钥」里填你自己的，只存本机
        </span>
        <button
          type="button"
          className="btn btn-sm shrink-0"
          aria-label="在新窗口打开生成平台"
          onClick={openInNewWindow}
        >
          新窗口打开
        </button>
        <button
          type="button"
          className="btn btn-sm shrink-0"
          aria-label="关闭生成视频窗口，回到工作台"
          onClick={() => setOpen(false)}
        >
          关闭
        </button>
      </div>
      <div className="relative min-h-0 w-full flex-1">
        <iframe
          key={attempt}
          ref={iframeRef}
          title="牢络生成平台"
          src={platformUrlFor(attempt)}
          className="absolute inset-0 h-full w-full"
          style={{ border: "none", background: "#0a0a0a" }}
          onLoad={hookPlatformWindow}
          onError={() => {
            console.error("[生成视频] 平台页面加载失败（iframe onError）");
          }}
        />
        {status === "loading" && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "#0a0a0a", pointerEvents: "none" }}
            aria-live="polite"
          >
            <span className="text-sm text-[var(--dim)]">正在打开生成平台…</span>
          </div>
        )}
        {status === "error" && (
          <div
            className="absolute inset-0 overflow-y-auto p-4"
            style={{ background: "#0a0a0a" }}
            role="alert"
          >
            <div className="card mx-auto my-4 max-w-lg">
              <p className="text-base font-bold text-[var(--text)]">
                生成平台这次没打开
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--dim)]">
                下面是这次打开走到的每一步，卡在哪一步一目了然。把诊断信息复制下来发到聊天里，就能对着它继续查；也可以先点「重新挂载」再试一次，或者点「新窗口打开」——新窗口里能打开、这里打不开，说明问题出在嵌入这一层。
              </p>
              <p className="mt-2 text-sm font-bold text-[var(--text)]">
                最后到达：{lastStageText}
              </p>
              <ol className="mt-3 space-y-2">
                {stages.map((s, i) => (
                  <li key={s.name} className="text-sm leading-6">
                    <span
                      className="font-bold"
                      style={{
                        color: s.done
                          ? "var(--olive)"
                          : i === firstUndone
                            ? "var(--bad)"
                            : "var(--dim)",
                      }}
                    >
                      {i + 1}. {s.name} · {stageLabel(s.done, i === firstUndone)}
                    </span>
                    <span className="block pl-4 text-[var(--dim)]">{s.detail}</span>
                  </li>
                ))}
              </ol>
              {d.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-bold text-[var(--text)]">捕获到的报错</p>
                  <ul className="mt-1 space-y-1">
                    {d.errors.map((e, i) => (
                      <li
                        key={i}
                        className="break-all text-xs leading-5"
                        style={{ color: "var(--bad)" }}
                      >
                        {e.message}
                        {e.filename
                          ? "（" + e.filename + ":" + e.lineno + ":" + e.colno + "）"
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.csp.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-bold text-[var(--text)]">
                    安全策略（CSP）拦截
                  </p>
                  <ul className="mt-1 space-y-1">
                    {d.csp.map((c, i) => (
                      <li
                        key={i}
                        className="break-all text-xs leading-5"
                        style={{ color: "var(--bad)" }}
                      >
                        [{c.source}] {c.directive} 拦下了 {c.blockedURI || "（地址未给出）"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3 text-xs leading-5 text-[var(--dim)]">
                <p className="break-all">平台地址：{platformUrlFor(attempt)}</p>
                <p>
                  浏览器：{d.boot?.ua || window.navigator.userAgent || "未知"} · 页面协议：
                  {window.location.protocol} · 诊断版本：{DIAG_BUILD}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  aria-label="复制全部诊断信息"
                  onClick={() => void copyDiag()}
                >
                  复制全部诊断
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label="重新挂载生成平台"
                  onClick={retry}
                >
                  重新挂载
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label="在新窗口打开生成平台（诊断面板）"
                  onClick={openInNewWindow}
                >
                  新窗口打开
                </button>
              </div>
              {copyNote && (
                <p className="mt-2 text-xs text-[var(--dim)]" role="status">
                  {copyNote}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
