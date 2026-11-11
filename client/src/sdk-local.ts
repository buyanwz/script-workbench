// 客户端本地 SDK 替代层（P1）— 取代 `@hatch/space-sdk/client`。
//
// 替换对照（port-plan.md §保留-3 / port-inventory.md §1.1）：
//   createActionClient → 本文件：POST /api/actions/:name（同源，同 schema）
//   spaceQueryClient   → 本文件：普通 QueryClient，默认配置与 SDK 一致
//   bytesToBase64 / fileToBase64 → 本文件：与 SDK 同款实现（32KB 分块）
//   shouldRetryAction  → 本文件：与 SDK 同款口径（只重试 retrySafe）
//   SafeAreaTopScrim   → 本文件：普通 div（Electron 桌面端安全区为 0，高度收为 0）
//   ApiRequest / ApiResponse → 本文件：与 SDK 同款类型
//
// 调用签名一律不变：`api.<动作名>(入参)`、`api` 的类型仍来自
// `typeof Actions`，客户端业务代码除 import 来源外一行不用改。

import { createElement } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { QueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import type { Actions } from "../../server/src/actions";

// ---------------------------------------------------------------------------
// 动作调用错误（与 SDK 的 SpaceActionError 同款字段）
// ---------------------------------------------------------------------------

export class SpaceActionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
    readonly retrySafe = false,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SpaceActionError";
  }
}

export const PERMANENT_ACTION_STATUSES = new Set([400, 401, 403, 404, 409, 413, 415, 422]);
export const MAX_ACTION_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 30_000;

/** 与 SDK 同款：只重试服务端明确标 retrySafe 的错误，4xx 等永久错误永不重试。 */
export function shouldRetryAction(failureCount: number, error: unknown): boolean {
  if (error instanceof SpaceActionError && PERMANENT_ACTION_STATUSES.has(error.status)) {
    return false;
  }
  return error instanceof SpaceActionError && error.retrySafe && failureCount < MAX_ACTION_RETRIES;
}

/** 与 SDK 同款：指数退避 + 全抖动，Retry-After 作下限。 */
export function actionRetryDelay(failureCount: number, error: unknown): number {
  const ceiling = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** failureCount);
  const floor =
    error instanceof SpaceActionError && error.retryAfterMs != null
      ? Math.min(RETRY_CAP_MS, Math.max(0, error.retryAfterMs))
      : 0;
  return floor + Math.random() * ceiling;
}

// ---------------------------------------------------------------------------
// QueryClient（与 SDK 的 spaceQueryClient 同款默认配置）
// ---------------------------------------------------------------------------

export const spaceQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryAction,
      retryDelay: actionRetryDelay,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

// ---------------------------------------------------------------------------
// 动作客户端：POST /api/actions/:name，请求体即入参 JSON
// ---------------------------------------------------------------------------

// 客户端只用每个动作的 request/response 做类型推导（与 SDK 的
// ClientActionShape 同款约束；handler 不进客户端类型）。
type ClientActionShape = { request: z.ZodType; response: z.ZodType };

export type ActionClient<A extends Record<string, ClientActionShape>> = {
  [K in keyof A]: (args: z.infer<A[K]["request"]>) => Promise<z.infer<A[K]["response"]>>;
};

export type ApiRequest<
  C extends Record<string, (args: never) => Promise<unknown>>,
  K extends keyof C,
> = Parameters<C[K]>[0];

export type ApiResponse<
  C extends Record<string, (args: never) => Promise<unknown>>,
  K extends keyof C,
> = Awaited<ReturnType<C[K]>>;

type AnyActionClient = Record<string, ClientActionShape>;

// ---------------------------------------------------------------------------
// 生图接口总设置（v5.70 口径，见 space-4 client/src/imageapi.ts）：
// 全站只一份的 API 地址 + Key，只存本机 localStorage，键
// imagegen.apiSettings.v1（{apiBase, apiKey}）。这里只读不写：每次
// 调动作都把总设置里的 Key/地址作为请求头带上，服务端按“请求头 >
// 环境变量”取 Key；总设置本身的编辑、存储与生效顺序一字不动。
// 移植工程里 v5.70 的设置面板尚未搬过来，所以目前这把 Key 平时
// 为空（读不到就不带头，服务端回落环境变量）；等面板搬过来、用户
// 在面板里填过之后，这里自动开始带头，不用再改。
// ---------------------------------------------------------------------------

const IMAGE_API_SETTINGS_KEY = "imagegen.apiSettings.v1";

function readImageApiSettingsHeaders(): Record<string, string> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    const raw = window.localStorage.getItem(IMAGE_API_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { apiBase?: unknown; apiKey?: unknown };
    const headers: Record<string, string> = {};
    if (typeof parsed.apiKey === "string" && parsed.apiKey.trim()) {
      headers["x-geeknow-api-key"] = parsed.apiKey.trim();
    }
    if (typeof parsed.apiBase === "string" && parsed.apiBase.trim()) {
      headers["x-geeknow-api-base"] = parsed.apiBase.trim();
    }
    return headers;
  } catch {
    return {};
  }
}

export function createActionClient<A extends AnyActionClient>(
  options: { fetch?: typeof fetch } = {},
): ActionClient<A> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return new Proxy({} as never, {
    get(_target, name) {
      if (typeof name !== "string") return undefined;
      if (name === "then" || name === "catch" || name === "finally") return undefined;
      return async (args: unknown) => {
        const response = await fetchImpl(`/api/actions/${encodeURIComponent(name)}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...readImageApiSettingsHeaders(),
          },
          body: JSON.stringify(args ?? {}),
        });
        let body: { data?: unknown; error?: string; code?: string; retrySafe?: boolean } = {};
        try {
          body = (await response.json()) as typeof body;
        } catch {
          // 非 JSON 响应：按 HTTP 状态报错。
        }
        if (!response.ok || (body && typeof body === "object" && "error" in body && body.error)) {
          const retryAfter = response.headers.get("retry-after");
          throw new SpaceActionError(
            body.error ? `action ${name} error: ${body.error}` : `action ${name} failed (HTTP ${response.status})`,
            response.status,
            retryAfter != null && retryAfter !== "" ? Number(retryAfter) * 1000 : undefined,
            body.retrySafe === true,
            body.code,
          );
        }
        return body.data as never;
      };
    },
  }) as never;
}

// ---------------------------------------------------------------------------
// Base64（与 SDK 同款：32KB 分块，防大文件爆栈）
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  const native = bytes as Uint8Array & { toBase64?: () => string };
  if (typeof native.toBase64 === "function") {
    return native.toBase64();
  }
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export async function fileToBase64(file: Blob): Promise<{ dataBase64: string; mimeType: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    dataBase64: bytesToBase64(bytes),
    mimeType: file.type || "application/octet-stream",
  };
}

// ---------------------------------------------------------------------------
// SafeAreaTopScrim（普通 div 版；Electron 桌面端安全区为 0，高度收为 0）
// ---------------------------------------------------------------------------

export type SafeAreaTopScrimVariant = "gradient" | "blur" | "solid";

export interface SafeAreaTopScrimProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  variant?: SafeAreaTopScrimVariant;
  backgroundColor?: CSSProperties["backgroundColor"];
  zIndex?: CSSProperties["zIndex"];
}

const TOP_SAFE_AREA_GRADIENT_MASK =
  "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.99) 10%, rgba(0, 0, 0, 0.96) 20%, rgba(0, 0, 0, 0.90) 30%, rgba(0, 0, 0, 0.80) 40%, rgba(0, 0, 0, 0.67) 50%, rgba(0, 0, 0, 0.52) 60%, rgba(0, 0, 0, 0.36) 70%, rgba(0, 0, 0, 0.20) 80%, rgba(0, 0, 0, 0.08) 90%, rgba(0, 0, 0, 0) 100%)";

export function SafeAreaTopScrim({
  variant = "gradient",
  backgroundColor,
  zIndex = 40,
  className,
  style,
  ...props
}: SafeAreaTopScrimProps) {
  const resolvedBackgroundColor = backgroundColor ?? style?.backgroundColor ?? "var(--bg)";
  // 桌面端无安全区变量时回落 0px，高度收为 0，与 SDK 在桌面端的行为一致。
  const inset = "var(--twsa-safe-area-inset-top, 0px)";
  const managedStyle: CSSProperties = {
    ...style,
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex,
    pointerEvents: "none",
    height: variant === "gradient" ? `calc(${inset} + min(2rem, ${inset}))` : inset,
    backgroundColor: resolvedBackgroundColor,
  };
  if (variant === "gradient") {
    managedStyle.maskImage = TOP_SAFE_AREA_GRADIENT_MASK;
    managedStyle.WebkitMaskImage = TOP_SAFE_AREA_GRADIENT_MASK;
  } else if (variant === "blur") {
    managedStyle.backdropFilter = style?.backdropFilter ?? "blur(12px)";
    managedStyle.WebkitBackdropFilter = style?.WebkitBackdropFilter ?? "blur(12px)";
  }
  return createElement("div", {
    ...props,
    "aria-hidden": props["aria-hidden"] ?? true,
    className,
    style: managedStyle,
  });
}

// 保留类型导出，供以 `typeof Actions` 方式使用的调用方做类型推导。
export type { Actions };
