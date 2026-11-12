// ---------------------------------------------------------------------------
// 生图接口总设置（v5.70）：用户可自填的 API 地址与 Key，全站只此一份
// 设置——左下角悬浮「设置」（settingsfloat.tsx，v5.88 起）是唯一的
// 编辑入口（v5.70–v5.87 曾在生图面板顶部），生图面板与封面生成提交
// 时都读同一份。填一次，生图面板和封面生成都
// 用；不填就回落已连接的 Geeknow 凭证（v3.83 以来的既有口径）。
//
// 存储口径（硬性）：只存浏览器本机 localStorage（键
// imagegen.apiSettings.v1），刷新还在、换电脑要重填；绝不进数据
// 库、不进备份包（backup 的 localSettings 是显式白名单，本键不在
// 名单里）、不进任何记录与日志。Key 在界面里只走密码框、永不明
// 文；服务端动作只在当次提交的内存里用它（submitGeeknowImageTask /
// pollGeeknowImageTask / probeGeeknowAuth 的 apiKey / apiBase 入参，
// v3.83 已有通道，本版不改服务端）。
//
// 生效顺序（Key 与地址分开看，逐项取第一个非空）：
//   1. 封面页单次输入（仅封面页有；只对当次提交有效、不持久化、
//      不写回总设置）——地址框等于默认地址视为「没改」，不算覆盖；
//   2. 本总设置；
//   3. 已连接的 Geeknow 凭证 + 默认地址。
// 安全护栏仍在服务端特权层（v3.83，未动）：非 geeknow 主机且没填
// Key 在发出请求前拒绝、http:// 地址格式错误拒绝、已连接凭证绝不
// 发去陌生主机。
// ---------------------------------------------------------------------------

export const IMAGE_API_SETTINGS_KEY = "imagegen.apiSettings.v1";
export const IMAGE_API_SETTINGS_EVENT = "imageapi-settings-changed";
export const DEFAULT_IMAGE_API_BASE = "https://api.geeknow.top";

export interface ImageApiSettings {
  apiBase: string;
  apiKey: string;
}

const EMPTY_SETTINGS: ImageApiSettings = { apiBase: "", apiKey: "" };

export function loadImageApiSettings(): ImageApiSettings {
  try {
    const raw = window.localStorage.getItem(IMAGE_API_SETTINGS_KEY);
    if (!raw) return { ...EMPTY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ImageApiSettings>;
    return {
      apiBase: typeof parsed.apiBase === "string" ? parsed.apiBase : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function saveImageApiSettings(settings: ImageApiSettings): void {
  try {
    window.localStorage.setItem(
      IMAGE_API_SETTINGS_KEY,
      JSON.stringify({
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
      }),
    );
  } catch {
    // 存不进（隐私模式等）就只当本次打开期间有效，不报错。
  }
  try {
    window.dispatchEvent(new Event(IMAGE_API_SETTINGS_EVENT));
  } catch {
    // 事件发不出去不影响已保存的设置本身。
  }
}

export function clearImageApiSettings(): void {
  try {
    window.localStorage.removeItem(IMAGE_API_SETTINGS_KEY);
  } catch {
    // 本机存储不可用时无可清，界面状态仍按已清处理。
  }
  try {
    window.dispatchEvent(new Event(IMAGE_API_SETTINGS_EVENT));
  } catch {
    // 同上。
  }
}

export type ImageApiSource = "cover" | "global" | "connected";

export interface ResolvedImageApi {
  /** 实际传给服务端动作的 Key；undefined = 走已连接凭证。 */
  apiKey?: string;
  /** 实际传给服务端动作的 API 地址；undefined = 服务端默认地址。 */
  apiBase?: string;
  /** 本次生效的最高优先级来源（任一字段来自该层即算）。 */
  source: ImageApiSource;
  /** 大白话状态行（不含 Key）：当前用：封面页单次输入 / 总设置 / 已连接凭证。 */
  sourceLabel: string;
  /** 本次实际用的 Key 是否来自总设置（报错分清「总设置 Key 被拒」用）。 */
  usedGlobalKey: boolean;
}

/**
 * 按生效顺序解析一次提交实际用的 Key 与地址。
 * global 传当前总设置（调用方自己的状态或 loadImageApiSettings()）；
 * coverOnce 只封面页传（它那两个单次输入框的当前值）。
 */
export function resolveImageApiConfig(
  global: ImageApiSettings,
  coverOnce?: { apiKey: string; apiBase: string },
): ResolvedImageApi {
  const coverKey = (coverOnce?.apiKey ?? "").trim();
  const coverBaseRaw = (coverOnce?.apiBase ?? "").trim();
  // 封面页地址框的初始值就是默认地址：等于默认地址视为「没改」，
  // 让总设置的地址有机会生效；只有填了别的地址才算单次覆盖。
  const coverBase =
    coverBaseRaw && coverBaseRaw !== DEFAULT_IMAGE_API_BASE
      ? coverBaseRaw
      : "";
  const globalKey = global.apiKey.trim();
  const globalBase = global.apiBase.trim();

  const key = coverKey || globalKey;
  const base = coverBase || globalBase || coverBaseRaw;
  const fromCover = !!coverKey || !!coverBase;
  const fromGlobal = (!coverKey && !!globalKey) || (!coverBase && !!globalBase);
  const source: ImageApiSource = fromCover
    ? "cover"
    : fromGlobal
      ? "global"
      : "connected";
  return {
    apiKey: key ? key : undefined,
    apiBase: base ? base : undefined,
    source,
    sourceLabel:
      source === "cover"
        ? "当前用：封面页单次输入"
        : source === "global"
          ? "当前用：总设置"
          : "当前用：已连接凭证",
    usedGlobalKey: !coverKey && !!globalKey,
  };
}
