// ---------------------------------------------------------------------------
// v5.80 防版权拦截开关：分镜 / 封面提示词导出前的一道纯文本处理。
//
// 背景：项目 43 分镜提示词在豆包被拦「生成的视频可能涉及版权限制，
// 请更换输入内容后重试」，触发点是漫威 IP 词（钢铁侠铠甲 / 无限手套
// / 打响指 / 灭霸同款）。本模块只处理「导出的那份文本」：
// ① 按替换表（内置 + 用户自定义）把 IP 词换成通用说法；
// ② 末尾加一句原创声明（项目 41第 4 条原文）；
// ③ 调用方据返回的 hits 在每个提示词块下方显示替换清单。
// 数据库里存的人物 / 剧本 / 分镜草稿一字不动；关掉开关立刻恢复
// 原文。开关状态与自定义词表只存本机 localStorage（键
// copyrightGuard.v1 / copyrightGuard.custom.v1），不进数据库、不进
// 备份、不进日志。
//
// v5.81 修复「开关点不动」（用户真机点按无反应）：旧实现点开关时
// 先 setState、再写 localStorage 并派发变更事件，组件自己的监听器
// 随即回读 localStorage 覆盖状态——在 localStorage 读不到刚写值的
// 环境里（沙箱 iframe / WebView 存储受限时 getItem 抛错，加载函数
// 按「默认开」兜底），回读永远拿到「开」，刚设好的「关」在同一次
// 点击里被瞬间弹回，视觉上就是点一下没反应（且只坏在关不掉这一
// 个方向上，与用户报告一致）。改法：模块级会话内存成为权威状态，
// 写状态先写内存、localStorage 只作尽力持久化；加载 / 回读一律先
// 看内存，存储回读再不可靠也弹不回本次会话里刚切换的值。另把开
// 关的可点区从 46×26 的小滑轨扩到整行（滑轨 + 标题 + 状态字一整
// 块都是开关按钮，min-height 44px），触屏不再只点得中那一小块。
// v5.81 同时按用户要求下线封面页的防拦截：封面页不再放开关、提
// 交时也不再过替换表，封面提示词按原文提交（本模块只余分镜页用）。
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

export interface CopyrightGuardPair {
from: string;
to: string;
}

export interface CopyrightGuardHit {
from: string;
to: string;
}

/** 内置替换表 v1（顺序即书写顺序；实际匹配按词长从长到短）。 */
export const COPYRIGHT_GUARD_BUILTIN: readonly CopyrightGuardPair[] = [
{ from: "灭霸同款无限手套", to: "金色宝石手套"},
{ from: "钢铁侠铠甲", to: "红金色未来机甲"},
{ from: "无限手套", to: "金色宝石手套"},
{ from: "六颗彩色宝石", to: "彩色宝石"},
{ from: "六颗宝石", to: "彩色宝石"},
{ from: "打响指", to: "做个手势"},
{ from: "响指", to: "手势"},
{ from: "灭霸", to: ""},
{ from: "钢铁侠", to: "机甲战士"},
];

/**
* 末尾原创声明：项目 41 提示词第 4 条「版权与原创声明」
* 原文（用户逐字定稿，见 项目41-提示词-加原创声明版.txt /
* 项目41-提示词-过审改写版.txt，两份一致），一字不改。
*/
export const COPYRIGHT_GUARD_STATEMENT =
"版权与原创声明：本视频为原创虚构喜剧短片，所有人物、造型、台词、场景均为原创设计，不复制、不改编任何已有影视、动漫、游戏、小说或短视频作品，不使用任何真实人物的姓名、肖像、商标或品牌标识；台词中的常识讨论仅为虚构课堂喜剧演绎，不针对任何真实个人或机构。";

const ENABLED_KEY = "copyrightGuard.v1";
const CUSTOM_KEY = "copyrightGuard.custom.v1";
const CHANGE_EVENT = "copyright-guard-changed";

// v5.81 会话内存（权威状态）：模块加载后第一次读 localStorage 定
// 初值，之后本会话内一切读写都以内存为准，localStorage 只在写入
// 时尽力同步一份供下次打开恢复。旧实现没有这层：setEnabled 写完
// 存储立刻派发事件、监听器马上回读存储覆盖状态，存储读不到刚写
// 的值时（沙箱 / WebView 存储受限，getItem 抛错走「默认开」兜底）
// 每次点关都被同一次点击里的回读弹回开——点不动的根因。
let sessionEnabled: boolean | null = null;
let sessionCustom: CopyrightGuardPair[] | null = null;

export function loadCopyrightGuardEnabled(): boolean {
if (sessionEnabled !== null) return sessionEnabled;
try {
// 默认开：没存过（null）也算开；只有明确存了 "0" 才是关。
sessionEnabled = window.localStorage.getItem(ENABLED_KEY)!== "0";
} catch {
sessionEnabled = true;
}
return sessionEnabled;
}

export function loadCopyrightGuardCustom(): CopyrightGuardPair[] {
if (sessionCustom !== null) return sessionCustom;
try {
const raw = window.localStorage.getItem(CUSTOM_KEY);
if (!raw) {
sessionCustom = [];
return sessionCustom;
}
const parsed: unknown = JSON.parse(raw);
if (!Array.isArray(parsed)) {
sessionCustom = [];
return sessionCustom;
}
const out: CopyrightGuardPair[] = [];
for (const item of parsed) {
if (
item &&
typeof item === "object" &&
typeof (item as { from?: unknown}).from === "string" &&
typeof (item as { to?: unknown}).to === "string" &&
(item as { from: string}).from.trim()!== ""
) {
out.push({
from: (item as { from: string}).from,
to: (item as { to: string}).to,
});
}
}
sessionCustom = out;
return sessionCustom;
} catch {
sessionCustom = [];
return sessionCustom;
}
}

function notifyCopyrightGuardChanged() {
try {
window.dispatchEvent(new Event(CHANGE_EVENT));
} catch {
/* 事件不可用时靠各组件挂载时读 localStorage 兜底 */
}
}

export function saveCopyrightGuardEnabled(next: boolean) {
// 先写会话内存（权威），再尽力写 localStorage 供下次打开恢复；
// 监听器回读时先看内存，存储写失败也不会把状态弹回去。
sessionEnabled = next;
try {
window.localStorage.setItem(ENABLED_KEY, next? "1": "0");
} catch {
/* localStorage 不可用时只保本次会话 */
}
notifyCopyrightGuardChanged();
}

export function saveCopyrightGuardCustom(next: CopyrightGuardPair[]) {
sessionCustom = next;
try {
window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
} catch {
/* localStorage 不可用时只保本次会话 */
}
notifyCopyrightGuardChanged();
}

/**
* 对一份导出的提示词文本做防版权处理：替换（自定义优先于内置、
* 最长匹配优先）→ 收多余空格 → 末尾加原创声明（文本里已有「版权
* 与原创声明」时不重复加）。返回处理后的文本与本份实际发生的替换
* 清单（按处理顺序，每词一条）。空文本原样返回、不加声明。
*/
export function applyCopyrightGuard(
text: string,
custom: CopyrightGuardPair[],
): { text: string; hits: CopyrightGuardHit[]} {
if (!text.trim()) return { text, hits: []};
const customFroms = new Set(custom.map((p) => p.from));
const merged: CopyrightGuardPair[] = [
...custom,
...COPYRIGHT_GUARD_BUILTIN.filter((p) =>!customFroms.has(p.from)),
].filter((p) => p.from.length > 0);
// 最长匹配优先：先整词组、后单个词；同长保持合并顺序（自定义在前）。
const ordered = [...merged].sort((a, b) => b.from.length - a.from.length);
let out = text;
const hits: CopyrightGuardHit[] = [];
for (const pair of ordered) {
if (out.includes(pair.from)) {
out = replacePairDedup(out, pair.from, pair.to);
hits.push({ from: pair.from, to: pair.to});
}
}
if (hits.length > 0) {
// 删词 / 换词后收多余空格：连续空格压成一个，中文标点前不留空格。
out = out
.replace(/[ \t]{2,}/g, " ")
.replace(/ +([，。；：、！？])/g, "$1");
}
if (!out.includes("版权与原创声明")) {
out = `${out.replace(/\s+$/, "")}\n${COPYRIGHT_GUARD_STATEMENT}`;
}
return { text: out, hits};
}

/**
* 单条替换（全量）：原文里紧挨原词前面的文字若与替换词开头重合
* （≥2 字），合并掉重合部分，不出叠字——如「金色无限手套」换成
* 「金色宝石手套」（不是「金色金色宝石手套」）、「穿红金钢铁侠铠
* 甲」换成「穿红金色未来机甲」。删词（to 为空）不走去重。
*/
function replacePairDedup(text: string, from: string, to: string): string {
if (to === "") return text.split(from).join("");
let out = "";
let i = 0;
for (;;) {
const idx = text.indexOf(from, i);
if (idx === -1) {
out += text.slice(i);
break;
}
let before = text.slice(i, idx);
const maxK = Math.min(4, to.length, before.length);
for (let k = maxK; k >= 2; k--) {
if (before.endsWith(to.slice(0, k))) {
before = before.slice(0, before.length - k);
break;
}
}
out += before + to;
i = idx + from.length;
}
return out;
}

/** 导出点击时现读本机状态处理文本（不需要 React 状态的调用点用）。 */
export function guardTextNow(text: string): string {
if (!loadCopyrightGuardEnabled()) return text;
return applyCopyrightGuard(text, loadCopyrightGuardCustom()).text;
}

/** 替换清单一行文案：有替换列清单，没替换写「本次无替换」。 */
export function formatGuardHits(hits: CopyrightGuardHit[]): string {
if (hits.length === 0) return "本次无替换";
return `已替换：${hits
.map((h) => `${h.from}→${h.to === ""? "（删掉）": h.to}`)
.join("、")}`;
}

export interface CopyrightGuardState {
enabled: boolean;
setEnabled: (next: boolean) => void;
custom: CopyrightGuardPair[];
setCustom: (next: CopyrightGuardPair[]) => void;
/** 开关打开时处理文本；关闭时原样返回且 hits 为空。 */
apply: (text: string) => { text: string; hits: CopyrightGuardHit[]};
}

export function useCopyrightGuard(): CopyrightGuardState {
const [enabled, setEnabledState] = useState<boolean>(loadCopyrightGuardEnabled);
const [custom, setCustomState] = useState<CopyrightGuardPair[]>(
loadCopyrightGuardCustom,
);
useEffect(() => {
const reload = () => {
setEnabledState(loadCopyrightGuardEnabled());
setCustomState(loadCopyrightGuardCustom());
};
window.addEventListener(CHANGE_EVENT, reload);
window.addEventListener("storage", reload);
return () => {
window.removeEventListener(CHANGE_EVENT, reload);
window.removeEventListener("storage", reload);
};
}, []);
const setEnabled = useCallback((next: boolean) => {
setEnabledState(next);
saveCopyrightGuardEnabled(next);
}, []);
const setCustom = useCallback((next: CopyrightGuardPair[]) => {
setCustomState(next);
saveCopyrightGuardCustom(next);
}, []);
const apply = useCallback(
(text: string) =>
enabled
? applyCopyrightGuard(text, custom)
: { text, hits: [] as CopyrightGuardHit[]},
[enabled, custom],
);
return { enabled, setEnabled, custom, setCustom, apply};
}

/**
* 开关控制条：只放在分镜页提示词区顶部（v5.81 起封面页不再做防
* 拦截）。开关 + 大白话说明 + 「管理替换词」面板（内置只读、自
* 定义可增删，改动立即生效）。
*/
export function CopyrightGuardControl({
guard,
}: {
guard: CopyrightGuardState;
}) {
const [panelOpen, setPanelOpen] = useState(false);
const [newFrom, setNewFrom] = useState("");
const [newTo, setNewTo] = useState("");
const addCustom = () => {
const from = newFrom.trim();
if (!from) return;
const rest = guard.custom.filter((p) => p.from!== from);
guard.setCustom([...rest, { from, to: newTo.trim()}]);
setNewFrom("");
setNewTo("");
};
return (
<div
className="mb-4 rounded-[var(--radius)] border p-3.5 card-shadow"
style={{ borderColor: "var(--border)", background: "var(--surface)"}}
aria-label="防版权拦截开关"
>
<div className="flex flex-wrap items-center gap-3">
{/* v5.81：滑轨 + 标题 + 状态字整块是同一个开关按钮（可点区
    ≥44px 高），触屏点标题或状态字也能切换，不再只有 46×26
    的小滑轨能点。 */}
<button
type="button"
role="switch"
aria-checked={guard.enabled}
aria-label="防版权拦截"
onClick={() => guard.setEnabled(!guard.enabled)}
className="flex shrink-0 cursor-pointer items-center gap-3"
style={{
minHeight: 44,
padding: "6px 10px 6px 2px",
margin: "-6px 0 -6px -2px",
background: "transparent",
border: "none",
color: "var(--text)",
}}
>
<span
aria-hidden="true"
className="relative shrink-0 rounded-full"
style={{
width: 46,
height: 26,
border: "1px solid var(--border)",
background: guard.enabled? "var(--walnut)": "var(--surface-alt)",
transition: "background 0.15s ease",
}}
>
<span
aria-hidden="true"
className="absolute rounded-full"
style={{
top: 2,
left: guard.enabled? 22: 2,
width: 20,
height: 20,
background: "#fff",
transition: "left 0.15s ease",
}}
/>
</span>
<span className="text-sm font-bold">防版权拦截</span>
<span className="text-xs text-[var(--dim)]">
{guard.enabled? "已打开": "已关闭"}
</span>
</button>
<button
type="button"
className="btn btn-sm ml-auto"
aria-expanded={panelOpen}
aria-label="管理替换词"
onClick={() => setPanelOpen((v) =>!v)}
>
{panelOpen? "收起替换词": "管理替换词"}
</button>
</div>
<p className="mt-2 text-xs leading-5 text-[var(--dim)]">
打开后，导出的提示词会自动把可能涉及版权的词换成通用说法；原数据不动，关掉立刻恢复原文。
</p>
{panelOpen && (
<div
className="mt-3 border-t pt-3"
style={{ borderColor: "var(--border)"}}
>
<p className="text-xs font-bold">内置替换词（只读）</p>
<ul className="mt-1.5 space-y-1 text-xs leading-5 text-[var(--dim)]">
{COPYRIGHT_GUARD_BUILTIN.map((p) => (
<li key={p.from}>
{p.from} → {p.to === ""? "（删掉）": p.to}
</li>
))}
</ul>
<p className="mt-3 text-xs font-bold">我自己加的替换词</p>
{guard.custom.length === 0? (
<p className="mt-1.5 text-xs leading-5 text-[var(--dim)]">
还没加过。以后再遇到会被拦的词，在下面加上，下次导出自动换。
</p>
): (
<ul className="mt-1.5 space-y-1.5">
{guard.custom.map((p) => (
<li
key={p.from}
className="flex flex-wrap items-center gap-2 text-xs leading-5"
>
<span>
{p.from} → {p.to === ""? "（删掉）": p.to}
</span>
<button
type="button"
className="btn btn-sm"
aria-label={`删除自定义替换词「${p.from}」`}
onClick={() =>
guard.setCustom(
guard.custom.filter((x) => x.from!== p.from),
)
}
>
删除
</button>
</li>
))}
</ul>
)}
<div className="mt-2.5 flex flex-wrap items-center gap-2">
<input
className="field field-sm"
style={{ width: 150}}
value={newFrom}
onChange={(e) => setNewFrom(e.target.value)}
placeholder="原词，如：奥特曼"
aria-label="自定义替换词的原词"
/>
<span aria-hidden="true" className="text-xs text-[var(--dim)]">
→
</span>
<input
className="field field-sm"
style={{ width: 170}}
value={newTo}
onChange={(e) => setNewTo(e.target.value)}
placeholder="替换词，留空 = 删掉这个词"
aria-label="自定义替换词的替换词（留空表示删掉）"
/>
<button
type="button"
className="btn btn-sm"
aria-label="添加自定义替换词"
onClick={addCustom}
disabled={!newFrom.trim()}
>
添加
</button>
</div>
<p className="mt-2 text-xs leading-5 text-[var(--dim)]">
同一个原词，自己加的为准；改动立即生效，下次导出就用新的。
</p>
</div>
)}
</div>
);
}
