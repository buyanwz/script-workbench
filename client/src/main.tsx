import { spaceQueryClient } from "./sdk-local";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
ensureMonitorCustomEventListener,
ensureMonitorInboxListener,
ensureMonitorIntakeHook,
} from "./monitorintake";
import "./theme.css";

// v4.34：监控页扩展上报钩子 window.__monitorIntake 的桩在 React
// 渲染前就装到本 frame 的 window 上（渲染/组件挂载出任何岔子都不
// 影响钩子存在），真正的建卡处理函数由 MonitorBench 挂载时挂上；
// 细节见 monitorintake.ts。
ensureMonitorIntakeHook();
// v4.35：广播入口——扩展 content script 改向 frame 广播 INBOX
// 消息（不再注入页面脚本找钩子），本监听器同样在渲染前装好，
// 收到后走 __monitorIntake 同一入口处理并回 INTAKE_RESULT 回执。
ensureMonitorInboxListener();
// v4.36：终极投递主通道——postMessage 到不了 app 的 blob:null
// 上下文，改用 CustomEvent 穿透隔离世界：扩展在每个 frame 里
// dispatch 'smzs-intake'，本监听器在渲染前装好，与 INBOX 监听共用
// 同一处理入口与 reportedAt 去重，结果经 'smzs-intake-result' 回。
ensureMonitorCustomEventListener();
// v4.63：刷新链接事件通道已作废下线，本文件不再装任何刷新
// 监听；刷新改走标签页方案（MonitorBench window.open 快手
// 视频页 + intake 回传，见 monitorbench.tsx）。

const rootEl = document.querySelector<HTMLElement>("[data-generated-space-root]");
if (!rootEl) {
  throw new Error("missing generated space root element");
}

// If you edit this file: keep `<QueryClientProvider client={spaceQueryClient}>`
// wrapping the app (every space shares the SDK's QueryClient), and keep
// BOTH the `hatch-space-root` class AND the `data-hatch-space-root`
// attribute on the outer div. The SDK styles select on
// `.hatch-space-root[data-hatch-space-root]` to apply mobile safe-area
// insets (notches, gesture bars, etc.), correct viewport sizing, and the
// hosting header/chrome offsets — dropping either breaks layout silently.
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={spaceQueryClient}>
      <div className="hatch-space-root" data-hatch-space-root>
        <App />
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
