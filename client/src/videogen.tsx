// 生成视频 · 牢络生成平台的接入 wrapper（v6.48 接入，v6.51 改直接挂载）
//
// v6.51 架构（彻底放弃 iframe）：v6.48 的 srcDoc、v6.49 的独立文档
// 地址、v6.50 的 iframe 诊断版在用户真机上始终没能把平台跑起来
// （诊断证实平台文档根本没加载进来）。按 Gemini 两轮咨询的结论改
// 为直接挂载：构建时 laoluo/sync.mjs 把平台单文件 source.html 抽成
// generated.js（bootLaoluo）+ generated.css（全部规则限定在
// .laoluo-host 内），随工作台 React 一起打包；运行时平台就跑在
// 工作台自己的文档里，不再有 iframe / 独立文档 / postMessage。
//
// 本模块只负责四件事，与平台本体严格分离：
//   1. 打开总线 openVideoGenPanel（与生图的 openImageGenPanel 同
//      制式），顶栏「生成视频」按钮调它；
//   2. 全页覆盖窗口：打开时锁背景滚动；v6.54 起取消通栏标题条、
//      画布顶到窗口顶，关闭改为右上角悬浮钮（平台右岛在抽取产物
//      里左移让位）；关窗只隐藏不卸载（保活），平台状态与后台
//      生成轮询不中断；
//   3. 直接挂载：LaoluoCanvasEmbed 只 boot 一次（ref 守卫 + 模块级
//      WeakSet 双保险）。平台的函数都关在 bootLaoluo 的作用域里、
//      没有挂到 window 上，原生内联处理器即使被环境编译出来也调
//      不到它们（沙箱实测会报「openTokenDialog is not defined」），
//      所以平台的内联 on* 处理器一律由 laoluo/delegate.ts 的祖先
//      遍历委托接管：委托挂在宿主的捕获阶段，派发完即停掉事件的
//      继续下传，原生处理器不会再被触发——有且仅有一路生效，绝
//      不双重触发。启动前另跑两项探针（结果只进诊断区）：原生内
//      联处理器是否被 CSP 拦、style 属性是否被剥离（被剥离才开
//      水合观察）。启动失败显示可见错误层 + 重试，绝不静默黑屏；
//   4. 生命周期与诊断：关窗时调平台的 suspend()（摘除它登记的
//      window 快捷键监听、暂停正在播的音频，定时器与生成轮询保
//      留），开窗时 resume()（挂回监听 + 重算画布）。覆盖窗内常驻
//      一个可折叠诊断区：启动状态、产物指纹（LAOLUO_SOURCE_HASH，
//      换源没重跑抽取时一眼能看出来）、两项探针结果、处理器错误
//      计数与「复制诊断信息」。处理器出错时宿主上方另有红色横幅
//      （点按复制全部错误明细）。
//
// 换平台新版只换 laoluo/source.html 并重跑 sync.mjs，本文件不用动
// （流程见 laoluo/README.md）。平台的密钥与状态仍只存它自己的
// 本机存储（llpub-*），与之前一致，无需迁移。

import { useEffect, useRef, useState } from "react";
import {
  bootLaoluo,
  LAOLUO_SOURCE_HASH,
  type LaoluoBootHandle,
} from "./laoluo/generated.js";
import "./laoluo/generated.css";
import {
  attachDelegation,
  probeNativeInline,
  probeStyleAttr,
  startStyleHydration,
  type HandlerError,
} from "./laoluo/delegate";

let openListener: (() => void) | null = null;
export function openVideoGenPanel() {
  openListener?.();
}

// v6.58 分镜 H3 批量生成：分镜页「发送到画布批量生成」把整批
// ShotBundle 交到这里——先记下待交付清单，再打开面板；面板启动
// 完成（phase=ready）且处于打开状态时，把清单交给平台的
// receiveShotBundle（平台侧打开批量面板接管）。清单只交付一
// 次；平台没接住（函数不存在）时保留待交付，下次打开再交。
export interface ShotBundlePayload {
  projectId: number | null;
  shots: unknown[];
}

let pendingBatch: ShotBundlePayload | null = null;

/** 打开视频生成面板并交付一批 ShotBundle（分镜页批量发送调用）。 */
export function openVideoGenPanelWithBatch(payload: ShotBundlePayload) {
  pendingBatch = payload;
  openListener?.();
}

type BootPhase = "idle" | "booting" | "ready" | "error";

/** 已成功 boot 过的宿主元素（模块级第二重保险，防重复启动）。 */
const bootedHosts = new WeakSet<HTMLElement>();

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export function VideoGenPanelHost() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<BootPhase>("idle");
  const [bootError, setBootError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [nativeInline, setNativeInline] = useState<boolean | null>(null);
  const [styleOk, setStyleOk] = useState<boolean | null>(null);
  const [handlerErrors, setHandlerErrors] = useState<HandlerError[]>([]);
  const [copyNote, setCopyNote] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<LaoluoBootHandle | null>(null);
  const bootedRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);
  const hydrationRef = useRef<MutationObserver | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const errorsRef = useRef<HandlerError[]>(handlerErrors);
  errorsRef.current = handlerErrors;

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

  // Esc 关闭覆盖窗；焦点在平台内部时 Esc 归平台自己（关菜单等），
  // 不连带关窗——平台与工作台同文档后必须分清这一点。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (hostRef.current && e.target instanceof Node && hostRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  // 启动（只一次）：探针（只记诊断）→ bootLaoluo → 委托常开接管
  // 内联处理器；style 被剥离才开水合。
  useEffect(() => {
    if (!mounted) return;
    if (bootedRef.current) return;
    const host = hostRef.current;
    const mountEl = mountRef.current;
    if (!host || !mountEl) return;
    if (bootedHosts.has(host)) {
      // 同一宿主已被启动过（例如开发热重载重挂）：没有 handle 就
      // 无法接管生命周期，宁可明确报错也不假装正常。
      if (!handleRef.current) {
        setBootError("平台已经启动过一次，但这次挂载丢了接管句柄；请刷新页面后重试。");
        setPhase("error");
      }
      return;
    }
    setPhase("booting");
    try {
      if (mountEl.id === "app") {
        throw new Error("挂载点 id 冲突：挂载点不能用 id=\"app\"，已停下以免误伤工作台界面。");
      }
      const native = probeNativeInline(host);
      setNativeInline(native);
      const sOk = probeStyleAttr(host);
      setStyleOk(sOk);
      const handle = bootLaoluo(mountEl);
      handleRef.current = handle;
      bootedHosts.add(host);
      bootedRef.current = true;
      // 委托常开：平台函数在 bootLaoluo 作用域内、没挂 window，
      // 原生内联处理器调不到（见文件头），只能靠委托执行；委托
      // 在捕获阶段派发并屏蔽原生触发，不会双重执行。
      detachRef.current = attachDelegation(host, handle.handlers, (err) => {
        console.error(
          "[生成视频] 平台按钮处理出错：" + err.reason +
            "（" + err.eventType + " @ " + err.element + "：" + err.expr + "）",
        );
        setHandlerErrors((prev) => [...prev.slice(-19), err]);
      });
      if (!sOk) {
        hydrationRef.current = startStyleHydration(host);
      }
      setPhase("ready");
      if (!openRef.current) handle.suspend();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[生成视频] 平台启动失败：" + msg);
      setBootError(msg);
      setPhase("error");
    }
  }, [mounted, retryNonce]);

  // 开关窗保活：关窗 suspend（摘平台的 window 快捷键、暂停音频，
  // 生成轮询定时器保留），开窗 resume（挂回监听、重算画布）。
  useEffect(() => {
    if (!bootedRef.current) return;
    const handle = handleRef.current;
    if (!handle) return;
    if (open) handle.resume();
    else handle.suspend();
  }, [open ]);

  // v6.58：待交付的 ShotBundle 在面板打开且启动完成时交给平台
  // 的 receiveShotBundle；交付成功才清待交付，平台没接住就留
  // 着下次打开再交（不丢清单）。
  useEffect(() => {
    if (!open || phase !== "ready") return;
    if (!pendingBatch) return;
    const handle = handleRef.current;
    if (!handle) return;
    const fn = handle.handlers["receiveShotBundle"];
    if (typeof fn !== "function") return;
    const payload = pendingBatch;
    pendingBatch = null;
    fn(payload);
  }, [open, phase ]);

  // 整页卸载时才 dispose（正常开关窗不调）。
  useEffect(() => {
    return () => {
      detachRef.current?.();
      detachRef.current = null;
      hydrationRef.current?.disconnect();
      hydrationRef.current = null;
      handleRef.current?.dispose();
      handleRef.current = null;
      bootedRef.current = false;
    };
  }, []);

  const retryBoot = () => {
    if (mountRef.current) mountRef.current.innerHTML = "";
    setBootError("");
    setPhase("idle");
    setRetryNonce((n) => n + 1);
  };

  const buildDiagText = (): string => {
    const lines: string[] = [];
    lines.push("生成视频 · 直接挂载诊断（v6.51 挂载架构 / v6.54 画布布局）");
    lines.push("时间：" + new Date().toISOString());
    lines.push("启动状态：" + phase + (bootError ? "（" + bootError + "）" : ""));
    lines.push("画布布局版本：v6.60（批量面板改居中悬浮窗＋面板内可选工作流与暂停后续排队＋按项目存档记录；BatchScheduler 与 v6.57 雷达/菜单保留）");
    lines.push("平台产物指纹 LAOLUO_SOURCE_HASH：" + LAOLUO_SOURCE_HASH);
    lines.push(
      "探针 · 原生内联处理器：" +
        (nativeInline === null
          ? "未测"
          : nativeInline
            ? "可编译（但平台函数在内部作用域、原生调不到；已由事件委托接管并屏蔽原生触发）"
            : "被拦截（已由事件委托接管）"),
    );
    lines.push(
      "探针 · style 属性：" +
        (styleOk === null ? "未测" : styleOk ? "生效（未开水合）" : "被剥离（已开 style 水合）"),
    );
    lines.push("处理器错误：" + errorsRef.current.length + " 次");
    for (const e of errorsRef.current) {
      lines.push("  - [" + e.eventType + "] " + e.element + " :: " + e.expr + " :: " + e.reason);
    }
    lines.push("浏览器：" + (window.navigator.userAgent || "未知"));
    return lines.join("\n");
  };

  const copyDiag = async () => {
    const ok = await copyText(buildDiagText());
    setCopyNote(ok ? "诊断信息已复制，去聊天里粘贴发出来就行。" : "复制没成功，请把诊断区截图发出来也行。");
  };

  const copyErrors = async () => {
    const text = errorsRef.current
      .map((e) => "[" + e.eventType + "] " + e.element + " :: " + e.expr + " :: " + e.reason)
      .join("\n");
    const ok = await copyText(text || "（暂无错误明细）");
    setCopyNote(ok ? "错误明细已复制。" : "复制没成功，请截图发出来也行。");
  };

  if (!mounted) return null;

  const latestError = handlerErrors[handlerErrors.length - 1];

  return (
    <div
      className="fixed inset-0 z-[96] flex-col"
      style={{
        display: open ? "flex" : "none",
        background: "var(--bg)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="生成视频（Flor911）"
    >
      {/* v6.54：通栏标题条取消，画布顶到窗口顶；关闭改为右上角
          悬浮钮（平台右岛已在抽取时左移让位，见 sync.mjs 的
          wrapper 覆盖规则），始终一键可达。 */}
      <button
        type="button"
        className="absolute right-2 top-2 z-[97] flex h-9 w-9 items-center justify-center rounded-full text-base"
        style={{
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
        }}
        aria-label="关闭生成视频窗口，回到工作台"
        onClick={() => setOpen(false)}
      >
        <span aria-hidden="true">✕</span>
      </button>
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={hostRef}
          className="laoluo-host absolute inset-0"
          style={{ background: "#0a0a0a", overflow: "hidden" }}
        >
          <div ref={mountRef} data-laoluo-mount="" style={{ width: "100%", height: "100%" }} />
        </div>
        {phase === "booting" && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "#0a0a0a", pointerEvents: "none" }}
            aria-live="polite"
          >
            <span className="text-sm text-[var(--dim)]">正在打开生成平台…</span>
          </div>
        )}
        {phase === "error" && (
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
                平台启动时出了下面这个错，所以没有显示出来。先点「重试」试一次；还是不行，就把左下角诊断区里的信息复制下来发到聊天里。
              </p>
              <p
                className="mt-2 break-all text-sm leading-6"
                style={{ color: "var(--bad)" }}
              >
                {bootError || "未知错误"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  aria-label="重试启动生成平台"
                  onClick={retryBoot}
                >
                  重试
                </button>
              </div>
            </div>
          </div>
        )}
        {handlerErrors.length > 0 && latestError && (
          <div
            className="absolute left-1/2 top-2 z-50 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-2 px-3 py-2 text-xs leading-5"
            style={{
              background: "var(--bad-soft)",
              color: "var(--bad)",
              border: "1px solid var(--bad)",
              borderRadius: "var(--radius)",
            }}
            role="alert"
          >
            <span className="min-w-0 truncate">
              平台有 {handlerErrors.length} 处按钮处理出错：{latestError.reason}
            </span>
            <button
              type="button"
              className="btn btn-sm shrink-0"
              aria-label="复制全部处理器错误明细"
              onClick={() => void copyErrors()}
            >
              复制明细
            </button>
            <button
              type="button"
              className="btn btn-sm shrink-0"
              aria-label="关掉处理器错误提示"
              onClick={() => setHandlerErrors([])}
            >
              知道了
            </button>
          </div>
        )}
        {phase !== "idle" && (
          <details
            className="absolute bottom-2 left-2 z-50 max-w-[calc(100%-16px)] text-xs leading-5 max-[900px]:bottom-16"
            style={{
              background: "var(--surface)",
              color: "var(--dim)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <summary
              className="cursor-pointer px-2 py-1 font-semibold"
              aria-label="展开或收起生成平台诊断区"
            >
              诊断
            </summary>
            <div className="px-2 pb-2">
              <p>启动状态：{phase === "ready" ? "已启动" : phase === "error" ? "启动失败" : "启动中"}</p>
              <p>画布布局版本：v6.60</p>
              <p className="break-all">产物指纹：{LAOLUO_SOURCE_HASH}</p>
              <p>
                按钮处理：
                {nativeInline === null
                  ? "未测"
                  : "已由工作台接管（平台内部按钮，浏览器自带的点法调不到）"}
              </p>
              <p>
                样式属性：
                {styleOk === null ? "未测" : styleOk ? "生效" : "被浏览器剥离（已开自动补样式）"}
              </p>
              <p>按钮处理错误：{handlerErrors.length} 次</p>
              <button
                type="button"
                className="btn btn-sm mt-1"
                aria-label="复制生成平台诊断信息"
                onClick={() => void copyDiag()}
              >
                复制诊断信息
              </button>
              {copyNote && (
                <p className="mt-1" role="status">
                  {copyNote}
                </p>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
