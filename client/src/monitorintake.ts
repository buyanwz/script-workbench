// 监控页扩展上报钩子 window.__monitorIntake 的注册中心（v4.34；
// v4.35 新增广播入口 ensureMonitorInboxListener；v4.36 新增
// CustomEvent 主通道 ensureMonitorCustomEventListener）。
//
// v4.33 的教训：钩子只在 MonitorBench 组件的 useEffect 里注册——组件
// 效果没跑到、跑到又被卸载清理、或扩展桥接脚本的等待窗口（数秒）
// 在钩子注册前就耗尽，window 上就查不到这个钩子（真机实测：所有
// frame 里 typeof window.__monitorIntake 都是 undefined，扩展侧
// 「hook not found after retries」）。本模块把注册拆成两层：
//
//   ① 桩（stub）：main.tsx 在 React 渲染之前调用
//      ensureMonitorIntakeHook()，本文件加载的 frame 的 window 上
//      立刻就有 __monitorIntake 函数，并打出
//      console.log('[workbench] __monitorIntake registered')，
//      在控制台按 frame 排查时能直接确认钩子在哪个 frame。
//      桩本身不建卡：真正的处理函数还没挂上时，调用先进队列等着；
//      等太久（20 秒）没人接手才回 {ok:false}，让扩展侧保留数据。
//   ② 处理函数（handler）：MonitorBench 挂载时经
//      attachMonitorIntakeHandler 挂到 window.__monitorIntakeHandler
//      槽位，桩随即把排队的调用逐个转交；MonitorBench 卸载时只摘
//      处理函数、桩与钩子本体永远不删——切走监控台、组件重挂载都
//      不会再出现「钩子消失」。
//
// 契约不变（见 ~/workspace/ext-build/monitor-intake-spec.md）：
// payload.protocol 不是 'smzs-monitor-intake/1' 或 rows 不是数组回
// {ok:false}；合法的上报返回 {ok:true, created, skipped}。校验由
// 处理函数做，桩只负责「钩子永远在、调用不丢失」。

export type MonitorIntakeResult = {
  ok: boolean;
  created?: number;
  skipped?: number;
};

export type MonitorIntakeHandler = (
  payload: unknown,
) => MonitorIntakeResult | Promise<MonitorIntakeResult>;

type QueuedIntakeCall = {
  payload: unknown;
  enqueuedAt: number;
  resolve: (r: MonitorIntakeResult) => void;
};

declare global {
  interface Window {
    __monitorIntake?: MonitorIntakeHandler;
    __monitorIntakeHandler?: MonitorIntakeHandler | null;
    __monitorIntakeQueue?: QueuedIntakeCall[];
  }
}

// 排队调用的最长等待：超过这个时长还没挂上处理函数就回 {ok:false}
// 并在冲刷队列时跳过（扩展侧收到失败不会标记已消费，数据保留，
// 下次补推还能再进来，届时按视频ID去重不会建重卡）。
const QUEUE_TIMEOUT_MS = 20_000;

let stubInstalled = false;

function flushIntakeQueue(): void {
  const handler = window.__monitorIntakeHandler;
  if (!handler) return;
  const queue = window.__monitorIntakeQueue ?? [];
  if (queue.length === 0) return;
  window.__monitorIntakeQueue = [];
  const now = Date.now();
  for (const item of queue) {
    if (now - item.enqueuedAt > QUEUE_TIMEOUT_MS) {
      item.resolve({ ok: false });
      continue;
    }
    Promise.resolve()
      .then(() => handler(item.payload))
      .then(item.resolve, () => item.resolve({ ok: false }));
  }
}

/**
 * 在当前 frame 的 window 上装好 __monitorIntake 桩（幂等：已装过
 * 就直接返回，不覆盖、不重复打日志）。由 main.tsx 在渲染前调用，
 * MonitorBench 挂处理函数时也会顺手再调一次兜底。
 */
export function ensureMonitorIntakeHook(): void {
  if (!Array.isArray(window.__monitorIntakeQueue)) {
    window.__monitorIntakeQueue = [];
  }
  if (stubInstalled && typeof window.__monitorIntake === "function") return;
  if (typeof window.__monitorIntake === "function") {
    // 已有一份钩子（例如重复执行的入口代码装过）：认它，不覆盖。
    stubInstalled = true;
    return;
  }
  const stub: MonitorIntakeHandler = (payload) => {
    const handler = window.__monitorIntakeHandler;
    if (handler) {
      try {
        return Promise.resolve(handler(payload));
      } catch {
        return Promise.resolve({ ok: false });
      }
    }
    return new Promise<MonitorIntakeResult>((resolve) => {
      (window.__monitorIntakeQueue ??= []).push({
        payload,
        enqueuedAt: Date.now(),
        resolve,
      });
      setTimeout(() => resolve({ ok: false }), QUEUE_TIMEOUT_MS);
    });
  };
  window.__monitorIntake = stub;
  stubInstalled = true;
  // 排查标记（用户要求）：在 app 所在 frame 的控制台会出现这一行；
  // 所有 frame 都没有这一行 = 新版本脚本根本没在任何 frame 执行。
  console.log("[workbench] __monitorIntake registered");
}

/**
 * MonitorBench 挂载时把真正的处理函数挂到槽位上并冲刷排队调用；
 * 返回摘除函数（卸载时调用，只摘自己这份处理函数，桩保留）。
 */
export function attachMonitorIntakeHandler(
  handler: MonitorIntakeHandler,
): () => void {
  ensureMonitorIntakeHook();
  window.__monitorIntakeHandler = handler;
  console.log("[workbench] __monitorIntake handler attached");
  flushIntakeQueue();
  return () => {
    if (window.__monitorIntakeHandler === handler) {
      window.__monitorIntakeHandler = null;
    }
  };
}

// ---------------------------------------------------------------------------
// v4.35 广播入口：扩展侧改走广播模式，不再往页面注入脚本找钩子——
// content script 监听 chrome.storage 后，向自己所在 frame 的 window
// 与页面里所有 iframe 的 contentWindow 广播
//   { __smzs_bridge: "cs", type: "INBOX", payload }
// 本监听器由 main.tsx 在 React 渲染前装进 app 所在 frame 的 window：
// 命中标记的消息就调 handleIntake —— 即 window.__monitorIntake 桩
// 本体，与直调钩子走同一条路（处理函数槽位 / 排队 / 20 秒超时口径
// 全不变），处理完经 ev.source 回
//   { __smzs_bridge: "page", type: "INTAKE_RESULT", ok, res | error }
// 扩展凭回执把这条上报标记已消费。本监听器与 __monitorIntake 并存：
// 钩子注册、排队、监控页绿色状态行全部保留，注入脚本直调钩子的旧
// 路也仍可工作。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// v4.36 终极投递：postMessage 到不了 app 的 blob:null 上下文，改用
// CustomEvent 穿透隔离世界。扩展的 content script 在每个 frame 里
// dispatch 'smzs-intake' CustomEvent —— CustomEvent 可以从隔离世界
// 直达本 frame 的主世界，App 在哪个 frame，哪个 frame 的事件必中，
// 不用再找 frame。处理完经 'smzs-intake-result' CustomEvent 回结果。
// reportedAt 去重防止多 frame / 重复 dispatch 重复触发。
// postMessage INBOX 监听（v4.35）保留，与 CustomEvent 共用
// __onIntakePayload 入口与去重逻辑。
// ---------------------------------------------------------------------------

// v4.50 去重表改存处理 Promise 本身（原为 Set 只记「处理过」）：
// 同一 reportedAt 第二次到达时不再直接丢弃，而是返回第一次的同
// 一个 Promise——调用方（postMessage 回执 / 轮询等待）拿到真实结
// 果照常回执。v4.49 及之前的丢弃式去重有个致命副作用：桥接靠回
// 执标记 chrome.storage 已消费，重复投递被丢弃时不发任何回执，
// 若首次处理的结果回执又没被扩展收到（或首次是经中转先到、桥接
// 那份成「重复」），这条上报永远停在「未消费」，扩展的 content
// script 在每次页面加载时都会把它补推一遍——一键清除把服务端卡
// 片删空后，补推的旧上报在处理函数处畅通无阻地重建卡片，这正
// 是 v4.50 排查出的复活主通道（用户真机截图：刷新后只有 toast
// 「收到扩展上报 1 条」、没有任何 [relay] 日志，走的正是桥接）。
const __processedIntakes = new Map<
  unknown,
  Promise<MonitorIntakeResult>
>();

const __handleIntake: MonitorIntakeHandler = (payload) => {
  const fn = window.__monitorIntake;
  if (typeof fn !== "function") return { ok: false };
  return fn(payload);
};

function __onIntakePayload(
  payload: unknown,
  via: string,
): Promise<MonitorIntakeResult> {
  // 数据来源诊断（v4.49）：本地桥接（CustomEvent / postMessage）
  // 收到上报时打固定标记，与中转通道的 [relay] 日志区分来源；
  // 中转走 dispatchMonitorIntake 时 via='relay'，不在此打。
  if (via !== "relay") {
    console.log("[bridge] 收到 intake");
  }
  const id = (payload as { reportedAt?: unknown } | null | undefined)
    ?.reportedAt;
  if (id) {
    const existing = __processedIntakes.get(id);
    if (existing) {
      // 重复投递：不重复处理，但把首次处理的结果 Promise 交回
      // 调用方——回执链完整，扩展能凭它标记已消费、停止补推。
      console.log("[workbench] duplicate intake ignored", id);
      return existing;
    }
  }
  const rows = (payload as { rows?: unknown[] } | null | undefined)?.rows;
  console.log(
    "[workbench] intake received via",
    via,
    "rows=",
    (rows || []).length,
    location.href,
  );
  const p = Promise.resolve(__handleIntake(payload));
  if (id) {
    __processedIntakes.set(id, p);
    if (__processedIntakes.size > 20) {
      const oldest = __processedIntakes.keys().next().value;
      __processedIntakes.delete(oldest);
    }
  }
  p.then(
    (res) => {
      console.log("[workbench] intake done", res);
      try {
        window.dispatchEvent(
          new CustomEvent("smzs-intake-result", {
            detail: { ok: !!(res && res.ok) },
          }),
        );
      } catch {
        // 回执发不出去不影响建卡本身，静默即可。
      }
    },
    (err: unknown) => {
      console.warn("[workbench] intake error", err);
      try {
        window.dispatchEvent(
          new CustomEvent("smzs-intake-result", {
            detail: {
              ok: false,
              error: String(
                (err as { message?: unknown } | null | undefined)?.message ||
                  err,
              ),
            },
          }),
        );
      } catch {
        // 同上，静默即可。
      }
    },
  );
  return p;
}

/**
 * v4.39 跨浏览器中转通道入口：中转轮询拿到 Worker 返回的 report 后
 * 经此函数送入，与 CustomEvent / postMessage 共用同一处理入口与
 * reportedAt 去重（__onIntakePayload）。via 固定传 'relay'，日志里
 * 能区分来源。返回处理 Promise；重复上报返回首次处理的同一个
 * Promise（v4.50，不再返回 null）。
 */
export function dispatchMonitorIntake(
  payload: unknown,
  via: string,
): Promise<MonitorIntakeResult> {
  return __onIntakePayload(payload, via);
}

let customEventListenerInstalled = false;

/**
 * 装好 CustomEvent 主通道监听器（幂等：装过直接返回）。由 main.tsx
 * 在渲染前调用，与 postMessage INBOX 监听共用 __onIntakePayload。
 */
export function ensureMonitorCustomEventListener(): void {
  if (customEventListenerInstalled) return;
  customEventListenerInstalled = true;
  ensureMonitorIntakeHook();
  window.addEventListener("smzs-intake", (e: Event) => {
    __onIntakePayload((e as CustomEvent).detail, "customevent");
  });
  console.log("[workbench] in-app CustomEvent intake listener ready", location.href);
}

// ---------------------------------------------------------------------------
// v4.63：「刷新链接」事件通道作废——v4.61/v4.62 的反向桥接
// （CustomEvent 'smzs-refresh' 发送 + 'smzs-refresh-result' 直回
// 监听 + postMessage REFRESH_VIDEO / REFRESH_RESULT）整段下线、
// 不再触发。刷新改走标签页方案：MonitorBench 点按钮时
// window.open 快手视频页（#smzs-refresh），扩展在新标签页抓到
// 新链接后经既有 intake 通道回传（payload 带 _refreshVideoId
// 标记），本文件只保留 intake 入向通道。
// ---------------------------------------------------------------------------

let inboxListenerInstalled = false;

/**
 * 装好广播 INBOX 监听器（幂等：装过直接返回，不重复监听、不重复
 * 打日志）。由 main.tsx 在渲染前调用。v4.36 起改调共用的
 * __onIntakePayload（去重与 CustomEvent 通道共用），处理结果仍经
 * ev.source 回 INTAKE_RESULT 回执；v4.50 起重复上报也回执（拿首次
 * 处理的同一结果），保证扩展每条投递都有回执可凭标记消费。
 */
export function ensureMonitorInboxListener(): void {
  if (inboxListenerInstalled) return;
  inboxListenerInstalled = true;
  ensureMonitorIntakeHook();
  window.addEventListener("message", (ev: MessageEvent) => {
    const m = ev.data as
      | { __smzs_bridge?: unknown; type?: unknown; payload?: unknown }
      | null
      | undefined;
    if (!m || m.__smzs_bridge !== "cs" || m.type !== "INBOX") return;
    const reply = (msg: Record<string, unknown>): void => {
      try {
        const src = ev.source as Window | null;
        src?.postMessage(msg, "*");
      } catch {
        // 回执发不出去不影响建卡本身，静默即可。
      }
    };
    const p = __onIntakePayload(m.payload, "postmessage");
    p.then(
      (res) =>
        reply({
          __smzs_bridge: "page",
          type: "INTAKE_RESULT",
          ok: !!(res && res.ok),
          res: res || null,
        }),
      (err: unknown) =>
        reply({
          __smzs_bridge: "page",
          type: "INTAKE_RESULT",
          ok: false,
          error: String(
            (err as { message?: unknown } | null | undefined)?.message || err,
          ),
        }),
    );
  });
  // 排查标记：这行带本 frame 的地址，多 frame 时控制台里看地址就
  // 知道监听器装在哪个 frame；所有 frame 都没这行 = 新版脚本没跑。
  console.log("[workbench] in-app INBOX listener ready", location.href);
}
