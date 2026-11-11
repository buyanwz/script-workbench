import { shouldRetryAction } from "./sdk-local";

// ---------------------------------------------------------------------------
// 网关超时重试（v3.57 追加修复，全站共用一套，不为每个流程各写一套）。
//
// 背景：生成类调用偶发出现 "Gateway request timed out: spaces.cvm.post"
// ——这是网关层超时，不是剧本 / 分析本身出错，同一次调用重试往往就
// 能成功。统一规则：
//   ① 只认网关超时（错误文案含 timed out / timeout / 网关超时）；
//      其他错误不重试、原样抛出 / 返回，不掩盖真实失败。
//      v4.72 起 callWithGatewayRetry 额外认推理通用失败文案
//      "inference failed"（见 isInferenceFailedText），同样自动重试
//      一次；withGatewayRetry 口径不变、仍只认网关超时。
//   ② 命中超时后隔几秒（默认 3 秒）自动重试同一次调用一次；重试的
//      是同一个请求（同一段 segmentIndex、同一份入参），幂等口径由
//      调用方保证：已保存的段落不会被重写、不会跳段、不会重复追加。
//   ③ 重试仍失败才把失败交回调用方，由调用方停在当前步并写清
//      「网关超时（可重试），已保存 X / 共 Y」——绝不假装走完。
//
// 用法：
//   - 返回 { ok, error } 的动作：callWithGatewayRetry(() => api.xxx(...))
//     ——抛出式超时与 ok:false 文案式超时都识别；最终结果原样返回。
//   - 纯抛出式调用（如保存 mutateAsync）：withGatewayRetry(fn)。
// onRetry 在开始等待重试时回调一次，供调用方把进度条阶段文字切成
// 「网关超时，正在自动重试…」，进度条不停在旧阶段装死。
// ---------------------------------------------------------------------------

export function isGatewayTimeoutText(text: string | null | undefined): boolean {
  if (!text) return false;
  return /gateway request timed out|timed out|timeout|网关超时/i.test(text);
}

/**
 * v4.72：平台推理的通用失败文案（"Web artifact inference failed."）。
 * 它不区分超时 / 超量 / 无返回，是推理后端内部失败，同一次调用重试
 * 往往能过——AI解剖实报：24 帧单次调用确定性挂这个文案，旧口径只认
 * 网关超时、对它零重试直接变红。callWithGatewayRetry 自 v4.72 起把
 * 它与网关超时同等对待（自动重试一次）；withGatewayRetry（纯抛出式）
 * 口径不变。
 */
export function isInferenceFailedText(text: string | null | undefined): boolean {
  if (!text) return false;
  return /inference failed/i.test(text);
}

function isInferenceFailedError(e: unknown): boolean {
  if (e instanceof Error) return isInferenceFailedText(e.message);
  return isInferenceFailedText(typeof e === "string" ? e : String(e ?? ""));
}

/** callWithGatewayRetry 的重试命中口径：网关超时或推理通用失败。 */
function isRetryableCallFailure(threw: boolean, e: unknown, errorText: string | null | undefined): boolean {
  if (threw) return isGatewayTimeoutError(e) || isInferenceFailedError(e);
  return isGatewayTimeoutText(errorText) || isInferenceFailedText(errorText);
}

export function isGatewayTimeoutError(e: unknown): boolean {
  // SDK 的 SpaceActionError 带 HTTP status：408 / 504 同样按网关超时
  // 口径处理（提交类调用方会据此提示「不确定是否收到、先别连点」）。
  const status = (e as { status?: unknown } | null)?.status;
  if (status === 408 || status === 504) return true;
  if (e instanceof Error) return isGatewayTimeoutText(e.message);
  return isGatewayTimeoutText(typeof e === "string" ? e : String(e ?? ""));
}

/**
 * P0 报错透明化（v3.83）：把动作调用抛出的真实错误翻成给用户看的
 * 一句话——优先错误原文，SDK 错误（SpaceActionError）再带上 HTTP
 * 状态码；原文里已含状态码时不重复。绝不把真实失败压成一句没有
 * 信息的「网络或服务异常」。注意：这里只读 message / status 两个
 * 字段，绝不序列化整个错误对象或请求参数（提交参数里可能含用户
 * 填的 Key，任何情况下都不能进报错文案）。
 */
export function describeThrownError(e: unknown): string {
  const rec = (e ?? {}) as { message?: unknown; status?: unknown };
  const msg =
    typeof rec.message === "string" && rec.message.trim()
      ? rec.message.trim()
      : e instanceof Error
        ? ""
        : typeof e === "string"
          ? e.trim()
          : "";
  const status = typeof rec.status === "number" ? rec.status : null;
  if (msg && status != null && !msg.includes(String(status))) {
    return `${msg}（HTTP ${status}）`;
  }
  if (msg) return msg;
  if (status != null) return `请求失败（HTTP ${status}），没有更多说明`;
  return "未知错误（没有返回错误说明）";
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export type GatewayRetryOpts = {
  /** 开始自动重试（等待 + 第二次调用）时回调一次 */
  onRetry?: () => void;
  /** 重试间隔毫秒，默认 3000 */
  delayMs?: number;
};

/** 纯抛出式调用：命中网关超时异常时自动重试一次，其余异常原样抛出。 */
export async function withGatewayRetry<T>(
  fn: () => Promise<T>,
  opts?: GatewayRetryOpts,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isGatewayTimeoutError(e)) throw e;
    opts?.onRetry?.();
    await sleep(opts?.delayMs ?? 3000);
    return await fn();
  }
}

/**
 * 写数据保存专用重试（v3.95）：与 withGatewayRetry 的区别是触发面
 * 更宽——不只网关超时，任何失败（HTTP 500、网络抖动、瞬时服务
 * 异常）都自动重试。理由：保存类动作都是「同一份完整数据整份
 * 重发」，天然幂等，重发不会写重、不会跳步、不会重复追加；而
 * 生成 / 提交类调用（会计费、会产生服务商任务）绝不用它，仍走
 * 上面的网关超时口径或不重试。默认共 3 次尝试（首次 + 2 次），
 * 间隔 1.2s / 2.4s 递增；onRetry 在每次重试前回调，供进度条把
 * 阶段文字切成「保存失败，正在自动重试…」，不停在旧阶段装死。
 * 全部尝试都失败才把最后一次错误原样抛出，交调用方写清状态。
 */
export async function withWriteRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;
    onRetry?: (nextAttempt: number, e: unknown) => void;
  },
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  let lastError: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i >= attempts) break;
      opts?.onRetry?.(i + 1, e);
      await sleep(1200 * i);
    }
  }
  throw lastError;
}

/**
 * 返回 { ok, error } 的动作调用：抛出式失败或 ok:false 的 error 命中
 * 重试口径（网关超时，或 v4.72 起的推理通用失败 "inference failed"）
 * 时，自动重试同一次调用一次；最终结果（成功、真实失败、或重试后
 * 仍失败）原样交回调用方处理，绝不吞掉失败。
 */
/**
 * v4.82 纯读查询客户端超时（AbortController）：读查询等太久多半是
 * 通道一时不通，与其无限等到网关层掐断，不如到点先把这次等待结束、
 * 按超时口径处理（配合 retryReadQuery 自动重试一次）。SDK 的动作
 * 客户端不透传 AbortSignal，底层请求无法真正取消，这里用
 * AbortController 驱动竞速拒绝：客户端不再等这次结果，服务端那次
 * 读就算随后完成也无副作用（纯读、结果直接丢弃）。只给纯读查询
 * 用——写 / AI / 生成类调用一律不套（它们的超时口径在各自流程里）。
 */
export const READ_QUERY_TIMEOUT_MS = 30_000;

export function isReadTimeoutError(e: unknown): boolean {
  return e instanceof Error && e.name === "ReadTimeoutError";
}

export async function withReadTimeout<T>(
  fn: () => Promise<T>,
  ms: number = READ_QUERY_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    return await new Promise<T>((resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          const err = new Error(
            `读取超时：等了 ${Math.round(ms / 1000)} 秒还没等到返回，多半是通道一时不通`,
          );
          err.name = "ReadTimeoutError";
          reject(err);
        },
        { once: true },
      );
      fn().then(resolve, reject);
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * v4.82 纯读查询的重试谓词（v4.80 项目列表查询的 retryProjectsQuery
 * 推广版）：网关超时或客户端读取超时 → 只自动重试一次（读重试天然
 * 安全，多数偶发抖动会被无感消化）；其余错误回落 SDK 默认
 * shouldRetryAction（只重试服务端明确标 retrySafe 的错误，4xx 等
 * 永久错误永不重试）。只接纯读查询，不改 SDK 全局默认、不套到任何
 * 写 / AI / 生成类调用，也不用 withWriteRetry（那是写数据口径）。
 */
export function retryReadQuery(failureCount: number, error: unknown): boolean {
  if (isGatewayTimeoutError(error) || isReadTimeoutError(error)) {
    return failureCount < 1;
  }
  return shouldRetryAction(failureCount, error);
}

export async function callWithGatewayRetry<
  T extends { ok: boolean; error?: string | null },
>(fn: () => Promise<T>, opts?: GatewayRetryOpts): Promise<T> {
  let firstError: unknown = null;
  let firstResult: T | null = null;
  let firstThrew = false;
  try {
    firstResult = await fn();
  } catch (e) {
    firstThrew = true;
    firstError = e;
  }
  const firstRetryable = isRetryableCallFailure(
    firstThrew,
    firstError,
    firstResult?.error,
  );
  if (!firstRetryable) {
    if (firstThrew) throw firstError;
    return firstResult as T;
  }
  opts?.onRetry?.();
  await sleep(opts?.delayMs ?? 3000);
  return await fn();
}
