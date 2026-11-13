// ---------------------------------------------------------------------------
// 监控中转站设置（v6.04，问题 #111301）：监控账号页用跨浏览器中转站
// （扩展上报拉取 + 刷新链接回程转发）需要两样东西——中转站地址与
// 中转站密钥。此前都写死在服务端特权层 RELAY_PY 里、界面上改不了；
// 本版在左下角悬浮「设置」（settingsfloat.tsx）里加了自填入口，存
// 储口径与生图接口总设置（imageapi.ts）一字同构：
//   - 只存浏览器本机 localStorage（键 monitor.relaySettings.v1），
//     刷新还在、换电脑要重填；绝不进数据库、不进备份包（backup 的
//     localSettings 是显式白名单，本键不在名单里）、不进任何记录
//     与日志。密钥在界面里只走密码框、永不明文。
//   - 逐项生效：两项都留空 = 用服务端内置的地址和密钥（v6.04 之前
//     的行为一字不变）；只填地址用填的地址＋内置密钥；只填密钥用
//     内置地址＋填的密钥。解析结果经监控页的三个中转动作
//     （fetchRelayIntake / testRelayConnection /
//     forwardRefreshToRelay）当次透传给服务端，特权层收到非空覆盖
//     值才覆盖内置值。
//   - 「当前用：…」来源行只显示地址来源（填的地址 / 内置地址），
//     绝不显示密钥。
// ---------------------------------------------------------------------------

export const RELAY_SETTINGS_KEY = "monitor.relaySettings.v1";
export const RELAY_SETTINGS_EVENT = "relay-settings-changed";

export interface RelaySettings {
  relayBase: string;
  relayToken: string;
}

const EMPTY_SETTINGS: RelaySettings = { relayBase: "", relayToken: "" };

export function loadRelaySettings(): RelaySettings {
  try {
    const raw = window.localStorage.getItem(RELAY_SETTINGS_KEY);
    if (!raw) return { ...EMPTY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<RelaySettings>;
    return {
      relayBase: typeof parsed.relayBase === "string" ? parsed.relayBase : "",
      relayToken:
        typeof parsed.relayToken === "string" ? parsed.relayToken : "",
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function saveRelaySettings(settings: RelaySettings): void {
  try {
    window.localStorage.setItem(
      RELAY_SETTINGS_KEY,
      JSON.stringify({
        relayBase: settings.relayBase,
        relayToken: settings.relayToken,
      }),
    );
  } catch {
    // 存不进（隐私模式等）就只当本次打开期间有效，不报错。
  }
  try {
    window.dispatchEvent(new Event(RELAY_SETTINGS_EVENT));
  } catch {
    // 事件发不出去不影响已保存的设置本身。
  }
}

export function clearRelaySettings(): void {
  try {
    window.localStorage.removeItem(RELAY_SETTINGS_KEY);
  } catch {
    // 本机存储不可用时无可清，界面状态仍按已清处理。
  }
  try {
    window.dispatchEvent(new Event(RELAY_SETTINGS_EVENT));
  } catch {
    // 同上。
  }
}

export interface ResolvedRelay {
  /** 实际传给服务端动作的中转站地址；"" = 用服务端内置地址。 */
  relayBase: string;
  /** 实际传给服务端动作的中转站密钥；"" = 用服务端内置密钥。 */
  relayToken: string;
  /** 大白话状态行（只说地址来源，绝不含密钥）：当前用：填的地址 / 内置地址。 */
  sourceLabel: string;
}

/**
 * 解析一次中转调用实际用的地址与密钥（逐项取第一个非空）：
 * 设置里填了就用填的，没填的那项回落服务端内置值（传空串）。
 */
export function resolveRelayConfig(settings: RelaySettings): ResolvedRelay {
  const relayBase = settings.relayBase.trim().replace(/\/+$/, "");
  const relayToken = settings.relayToken.trim();
  return {
    relayBase,
    relayToken,
    sourceLabel: relayBase ? "当前用：填的地址" : "当前用：内置地址",
  };
}

/** 动作入参版（只带地址与密钥两项，不带来源行文案）：监控页三个
 * 中转动作调用时展开进 args。 */
export function relayActionArgs(settings: RelaySettings): {
  relayBase: string;
  relayToken: string;
} {
  const { relayBase, relayToken } = resolveRelayConfig(settings);
  return { relayBase, relayToken };
}
