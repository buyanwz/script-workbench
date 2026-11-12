// ---------------------------------------------------------------------------
// 左下角悬浮「设置」（v5.88）：按用户要求参照豆包的左下角展开悬浮
// 框架——页面左下角常驻一个「设置」按钮，点开向上展开一个悬浮框，
// 框里放全站设置。当前设置只有一项：v5.70 的「生图接口总设置」
// （API 地址 + 密钥 Key），本版从生图面板顶部整份搬到这里——全站
// 仍然只此一份，存储与读取口径一字不变：
//   - 只存浏览器本机 localStorage（键 imagegen.apiSettings.v1，见
//     imageapi.ts），刷新还在、换电脑要重填；不进数据库、不进备
//     份包、不进任何记录与日志；Key 只走密码框、永不明文显示。
//   - 生效顺序不变：封面页单次输入 > 本总设置 > 已连接凭证，逐项
//     解析见 imageapi.ts 的 resolveImageApiConfig；生图面板与封面
//     页都经 IMAGE_API_SETTINGS_EVENT 即时读到新值，本组件是唯一
//     的编辑入口（生图面板顶部不再另放一份）。
//   - 「检测这份设置（只读预检）」与「清除」（先确认、明说 Key 清
//     掉找不回）随表单一起搬来，行为与 v5.70 一字不变。
// 悬浮框 z-[55]：低于生图面板（z-[60]）与各类确认弹窗（z-50 起的
// ConfirmDialog 在本框之上弹出清除确认时仍可点），高于主内容区。
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { api } from "./api";
import { ConfirmDialog } from "./confirm";
import { describeThrownError } from "./gateway";
import {
  clearImageApiSettings,
  loadImageApiSettings,
  resolveImageApiConfig,
  saveImageApiSettings,
  DEFAULT_IMAGE_API_BASE,
  IMAGE_API_SETTINGS_EVENT,
  type ImageApiSettings,
} from "./imageapi";

const labelCls = "mb-1 block text-xs font-bold text-[var(--dim)]";

/** 生图接口总设置表单（全站唯一编辑入口，v5.88 起住在左下角「设置」里）。 */
function ImageApiSettingsForm() {
  const [apiSettings, setApiSettings] = useState<ImageApiSettings>(() =>
    loadImageApiSettings(),
  );
  const [apiProbeMsg, setApiProbeMsg] = useState<string | null>(null);
  const [apiProbeBad, setApiProbeBad] = useState(false);
  const [apiProbing, setApiProbing] = useState(false);
  const [apiClearAsk, setApiClearAsk] = useState(false);
  const resolved = resolveImageApiConfig(apiSettings);

  // 设置在别处被改时同步（跨窗口 storage 事件；同页写入方只有本表单）。
  useEffect(() => {
    const on = () => setApiSettings(loadImageApiSettings());
    window.addEventListener(IMAGE_API_SETTINGS_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(IMAGE_API_SETTINGS_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const updateApiSettings = (next: ImageApiSettings) => {
    setApiSettings(next);
    saveImageApiSettings(next);
    setApiProbeMsg(null);
  };

  // 只读预检：用当前总设置探一次提交口鉴权（不存在的模型名，不建
  // 任务、不计费）；护栏类拒绝（非 geeknow 主机没填 Key / http://
  // 地址）由特权层在发请求前回 ok=false + 护栏原文，单独按「会被
  // 拦下」展示，不混进「预检没查成」。（与 v5.70 原逻辑一字不变。）
  const runApiProbe = async () => {
    if (apiProbing) return;
    setApiProbing(true);
    setApiProbeMsg(null);
    try {
      const cfg = resolveImageApiConfig(apiSettings);
      const p = await api.probeGeeknowAuth({
        apiKey: cfg.apiKey,
        apiBase: cfg.apiBase,
      });
      if (
        !p.ok &&
        p.error &&
        (p.error.includes("不在 Geeknow") || p.error.includes("API 地址格式不对"))
      ) {
        setApiProbeBad(true);
        setApiProbeMsg(
          `这份设置提交时会被拦下：${p.error}。请求还没发出去，不会计费。`,
        );
        return;
      }
      if (!p.ok) {
        setApiProbeBad(true);
        setApiProbeMsg(
          `预检没查成（${p.error ?? "网络或服务异常"}）：这说明不了 Key 有没有问题，可以再点一次检测；点「生成图片」时用的就是这份设置。`,
        );
        return;
      }
      if (p.authOk) {
        setApiProbeBad(false);
        setApiProbeMsg(
          p.usedCustomKey
            ? "预检通过：这份设置里填的地址 + Key 能通过鉴权——生图面板和封面生成提交时都会用它。"
            : "预检通过：已连接的 Geeknow 凭证可用（这份设置没填内容，走的就是这份凭证）。",
        );
      } else {
        setApiProbeBad(true);
        setApiProbeMsg(
          p.usedCustomKey
            ? `这份设置里填的 Key 被拒绝了（${p.error ?? "鉴权失败"}）：多半是填错了、已过期，或不是这个 API 地址的 Key。改对，或点「清除」改用已连接凭证。这次没有提交生图、不会计费。`
            : `已连接的 Geeknow 凭证被拒绝了（${p.error ?? "鉴权失败"}）：请重新连接 Geeknow。这次没有提交生图、不会计费。`,
        );
      }
    } catch (e) {
      setApiProbeBad(true);
      setApiProbeMsg(`预检没查成：${describeThrownError(e)}`);
    } finally {
      setApiProbing(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">生图接口（API 地址和密钥）</p>
        <span
          className="text-xs font-bold"
          style={{ color: "var(--olive)" }}
          role="status"
        >
          {resolved.sourceLabel}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
        这是工作台生图时「去哪儿生成、用谁的账户」的总开关：生图面板和封面生成都用这一份，填一次就行，不用每个地方各填一遍。下面两个框都只存在这台设备的浏览器本机里（刷新还在、换电脑要重填），不进数据库、不进备份包、不进任何记录和日志。
      </p>

      <div className="mt-3">
        <label className={labelCls} htmlFor="settings-api-base">
          API 地址
        </label>
        <input
          id="settings-api-base"
          type="text"
          className="field field-sm"
          value={apiSettings.apiBase}
          autoComplete="off"
          placeholder={DEFAULT_IMAGE_API_BASE}
          aria-label="生图接口设置：API 地址（生图请求发去的地方；留空用默认 https://api.geeknow.top）"
          onChange={(e) =>
            updateApiSettings({ ...apiSettings, apiBase: e.target.value })
          }
        />
        <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
          干什么用的：这是生图请求要发去的服务器地址，相当于「去哪家店生成图片」。填了就按你填的地址发；不填就用默认地址
          https://api.geeknow.top（也就是现在一直在用的 Geeknow）。一般不用改，只有换了别的生图服务、对方给了你新地址时才填。
        </p>
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor="settings-api-key">
          密钥（Key）
        </label>
        <input
          id="settings-api-key"
          type="password"
          className="field field-sm"
          value={apiSettings.apiKey}
          autoComplete="off"
          placeholder="留空 = 用已连接的 Geeknow 凭证"
          aria-label="生图接口设置：密钥 Key（相当于生图账户的密码，密码框输入、永不明文显示；留空用已连接的 Geeknow 凭证）"
          onChange={(e) =>
            updateApiSettings({ ...apiSettings, apiKey: e.target.value })
          }
        />
        <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
          干什么用的：相当于生图账户的「密码」，服务器靠它认人、把费用记在对应账户上。填了就用你填的这把 Key
          扣你自己的账户；不填就用工作台已经连好的 Geeknow
          凭证，和以前一样，不用管。密码框输入、永远不明文显示。
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
          注意：上面地址换成别的域名时，必须同时填那个地址对应的
          Key——工作台绝不会把已连接凭证发去别的地址，没填 Key 会在提交前拦下，不会误扣、也不会泄露。
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-sm"
          disabled={apiProbing}
          aria-label="检测这份设置能否通过鉴权（只读预检，不提交生图、不计费）"
          onClick={() => void runApiProbe()}
        >
          {apiProbing ? "检测中…" : "检测这份设置（只读预检）"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger-ghost"
          disabled={!apiSettings.apiBase && !apiSettings.apiKey}
          aria-label="清除这份设置（先弹确认；清掉保存在本机的 API 地址和密钥，之后回落已连接凭证）"
          onClick={() => setApiClearAsk(true)}
        >
          清除
        </button>
      </div>
      {apiProbeMsg && (
        <p
          className="mt-2 text-xs leading-5"
          style={{ color: apiProbeBad ? "var(--bad)" : "var(--olive)" }}
          role="status"
        >
          {apiProbeMsg}
        </p>
      )}

      {/* 清除确认：Key 清掉就找不回来（本机没有别处存份），先确认
          一次防手滑；确认后地址与 Key 一并清掉、回落已连接凭证。 */}
      {apiClearAsk && (
        <ConfirmDialog
          title="清除生图接口设置？"
          body={
            <p>
              会把保存在这台浏览器本机里的 API 地址和密钥一起清掉。密钥清掉后找不回来（工作台别处没有存份），之后生图面板和封面生成都会改回用已连接的
              Geeknow 凭证。要继续吗？
            </p>
          }
          confirmLabel="清除"
          cancelLabel="不清除"
          onConfirm={() => {
            clearImageApiSettings();
            setApiSettings({ apiBase: "", apiKey: "" });
            setApiProbeMsg(null);
            setApiClearAsk(false);
          }}
          onCancel={() => setApiClearAsk(false)}
        />
      )}
    </div>
  );
}

/**
 * 左下角悬浮「设置」框架：收起时只是一个「设置」按钮，点开向上展
 * 开悬浮框；再点按钮或框右上角「收起」关闭。任何页面都在，位置参
 * 照豆包左下角。全站挂载一份（App.tsx 外壳）。
 */
export function SettingsDock() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 left-3 z-[55] sm:left-4">
      {open && (
        <div
          className="card-shadow mb-2 max-h-[calc(100dvh-120px)] w-[min(380px,calc(100vw-24px))] overflow-y-auto rounded-[14px] border p-4"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
          role="dialog"
          aria-label="设置"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-display text-base font-bold">设置</p>
            <button
              type="button"
              className="btn btn-sm"
              aria-label="收起设置"
              onClick={() => setOpen(false)}
            >
              收起
            </button>
          </div>
          <ImageApiSettingsForm />
        </div>
      )}
      <button
        type="button"
        className="card-shadow flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          minHeight: 44,
        }}
        aria-label={open ? "收起左下角设置" : "打开左下角设置（生图接口的 API 地址和密钥在这里）"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">⚙</span>
        设置
      </button>
    </div>
  );
}
