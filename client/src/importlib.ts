// 导入剧本：把外部改好的稿子（本工作台导出的项目 JSON / 剧本 JSON、
// 剧本格式01 Markdown、纯文本剧本）解析回 ScriptData。
//
// 原则：先解析、后预览、确认才覆盖（覆盖动作在 App 里走既有
// saveScript + 「导入剧本覆盖前」自动快照）。解析不出的行一律原样
// 收集到 issues 里（带行号与改法提示），绝不静默丢掉；整体解析
// 失败时抛带可操作中文说明的 Error，调用方不改动当前稿、不产生
// 快照。导入稿一律回到审查阶段：分镜分组、生成计划、音色覆盖等
// 派生状态在归一化时全部清掉，由审查页按新稿重新校验。

import type {
Beat,
CharacterRow,
Overlay,
ScriptData,
ScriptGroup,
TempCharacterState,
} from "./scriptlib";
import { durationSummary } from "./scriptlib";

export interface ImportIssue {
/** 1-based line number in the source file (0 = not line-bound). */
lineNo: number;
/** The original line, verbatim. */
text: string;
/** What to do about it, in plain Chinese. */
hint: string;
}

export interface ImportedSettings {
speechRate?: number;
styleLabel?: string;
targetSeconds?: number;
stylePreset?: string;
styleCustom?: string;
}

export interface ScriptImportResult {
kind: "json" | "markdown" | "text";
fileName: string;
/** Normalized script (stage forced to review by the caller). */
script: ScriptData;
issues: ImportIssue[];
/** Settings the file itself carries, if any (JSON / 基本信息）. */
importedSettings: ImportedSettings | null;
}

// ---------------------------------------------------------------------------
// small coercion helpers
// ---------------------------------------------------------------------------

const s = (v: unknown): string => (typeof v === "string"? v: v == null? "": String(v));
const n = (v: unknown): number | null => {
const x = typeof v === "number"? v: typeof v === "string"? Number(v): NaN;
return Number.isFinite(x)? x: null;
};

function stripQuotes(t: string): string {
const x = t.trim();
if (
(x.startsWith('"') && x.endsWith('"')) ||
(x.startsWith("“") && x.endsWith("”")) ||
(x.startsWith("「") && x.endsWith("」"))
) {
return x.slice(1, -1).trim();
}
return x;
}

function baseTitle(fileName: string): string {
return fileName.replace(/\.[^.]+$/, "").trim() || "未命名剧本";
}

// ---------------------------------------------------------------------------
// Normalization of a raw script object (JSON path; also the final shape
// the Markdown / text parsers build towards).
// ---------------------------------------------------------------------------

function normalizeBeat(raw: unknown): Beat | null {
if (!raw || typeof raw!== "object") return null;
const b = raw as Record<string, unknown>;
const line = s(b.line);
const action = n(b.actionSeconds);
return {
visual: s(b.visual),
sfx: s(b.sfx),
speaker: s(b.speaker),
emotion: s(b.emotion),
line,
actionSeconds: action!= null && action >= 0? action: line.trim()? 0: 2,
};
}

function normalizeRawScript(
raw: Record<string, unknown>,
fileName: string,
issues: ImportIssue[],
): ScriptData {
const groups: ScriptGroup[] = [];
const rawGroups = Array.isArray(raw.groups)? raw.groups: [];
rawGroups.forEach((g, gi) => {
if (!g || typeof g!== "object") return;
const gr = g as Record<string, unknown>;
const beats: Beat[] = [];
const rawBeats = Array.isArray(gr.beats)? gr.beats: [];
for (const rb of rawBeats) {
const beat = normalizeBeat(rb);
if (beat) beats.push(beat);
}
if (beats.length === 0) {
issues.push({
lineNo: 0,
text: `段落「${s(gr.title) || `第 ${gi + 1} 段`}」没有任何节拍`,
hint: "这一段在导入时被跳过：请在原文件里给这一段补上至少一个节拍（画面或台词）再导入。",
});
return;
}
groups.push({
title: s(gr.title) || `段落${groups.length + 1}`,
sceneName: s(gr.sceneName),
beats,
});
});

const characterRows: CharacterRow[] = [];
const rawRows = Array.isArray(raw.characterRows)? raw.characterRows: [];
for (const r of rawRows) {
if (!r || typeof r!== "object") continue;
const row = r as Record<string, unknown>;
const name = s(row.name).trim();
if (!name) continue;
characterRows.push({
name,
identity: s(row.identity),
look: s(row.look),
voice: s(row.voice),
tone: s(row.tone),
});
}

const overlays: Overlay[] = [];
const rawOverlays = Array.isArray(raw.overlays)? raw.overlays: [];
for (const o of rawOverlays) {
if (!o || typeof o!== "object") continue;
const ov = o as Record<string, unknown>;
const gi = n(ov.groupIndex)?? 0;
overlays.push({
type: s(ov.type) || "花字",
groupIndex: Math.min(Math.max(0, Math.floor(gi)), Math.max(0, groups.length - 1)),
content: s(ov.content),
});
}

const strList = (v: unknown): string[] =>
Array.isArray(v)? v.map((x) => s(x)).filter((x) => x.trim()): [];

const tempStates: Record<string, TempCharacterState> = {};
const rawStates = raw.tempCharacterStates;
if (rawStates && typeof rawStates === "object" &&!Array.isArray(rawStates)) {
for (const [name, st] of Object.entries(rawStates as Record<string, unknown>)) {
if (!st || typeof st!== "object") continue;
const sv = st as Record<string, unknown>;
const disp = sv.disposition;
if (disp!== "extra" && disp!== "deleted" && disp!== "mapped" && disp!== "pending") continue;
tempStates[name] = {
disposition: disp,
look: s(sv.look),
voice: s(sv.voice),
tone: s(sv.tone),
kind: sv.kind === "group"? "group": "single",
mappedTo: typeof sv.mappedTo === "string"? sv.mappedTo: undefined,
};
}
}

const generatedAtRaw = s(raw.generatedAt);
const generatedAt =
generatedAtRaw &&!Number.isNaN(Date.parse(generatedAtRaw))
? generatedAtRaw
: new Date().toISOString();

return {
title: s(raw.title).trim() || baseTitle(fileName),
pendingItems: strList(raw.pendingItems),
synopsis: s(raw.synopsis),
characterRows,
groups,
overlays,
generationNotes: strList(raw.generationNotes),
versionNote: s(raw.versionNote).trim() || "外部导入的剧本（原文件未填写版本说明）",
// Placeholder settings: the dialog replaces these with either the
// current project settings (default) or the file's own settings.
speechRate: n(raw.speechRate)?? 5,
styleLabel: s(raw.styleLabel),
targetSeconds: n(raw.targetSeconds)?? 0,
snapshotStylePreset: typeof raw.snapshotStylePreset === "string"? raw.snapshotStylePreset: undefined,
snapshotStyleCustom: typeof raw.snapshotStyleCustom === "string"? raw.snapshotStyleCustom: undefined,
generatedAt,
stage: "review",
tempCharacterStates: Object.keys(tempStates).length > 0? tempStates: undefined,
};
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function parseJsonImport(fileName: string, content: string): ScriptImportResult {
let data: unknown;
try {
data = JSON.parse(content);
} catch {
throw new Error(
"导入失败：这个文件不是完整的 JSON，中间可能被改坏了。请用工作台导出的原始文件再试；如果你的稿子是文字版，请另存为.txt 或.md 再导入。",
);
}
if (!data || typeof data!== "object" || Array.isArray(data)) {
throw new Error("导入失败：这个 JSON 里没有剧本内容。请确认文件是本工作台导出的项目 JSON 或剧本 JSON。");
}
const obj = data as Record<string, unknown>;
const issues: ImportIssue[] = [];
let rawScript: Record<string, unknown> | null = null;

if (typeof obj.scriptJson === "string") {
// Whole-project export: the script rides inside as a JSON string.
try {
const inner = JSON.parse(obj.scriptJson) as unknown;
if (inner && typeof inner === "object" &&!Array.isArray(inner)) {
rawScript = inner as Record<string, unknown>;
}
} catch {
throw new Error("导入失败：项目文件里的剧本部分已损坏，读不出来。当前稿没有被改动。");
}
if (!rawScript) {
throw new Error("导入失败：这个项目文件里没有剧本（可能导出时还没有生成剧本）。当前稿没有被改动。");
}
} else if (Array.isArray(obj.groups)) {
rawScript = obj;
}

if (!rawScript) {
throw new Error(
"导入失败：这个 JSON 里没有找到剧本段落（groups）。请确认文件是本工作台导出的项目 JSON，或剧本审查页保存的剧本 JSON。",
);
}

const script = normalizeRawScript(rawScript, fileName, issues);
if (script.groups.length === 0) {
throw new Error("导入失败：文件里没有任何带节拍的段落。请先在原文件里补齐段落和节拍再导入，当前稿没有被改动。");
}
const importedSettings: ImportedSettings = {};
const rate = n(rawScript.speechRate);
if (rate!= null && rate > 0) importedSettings.speechRate = rate;
if (s(rawScript.styleLabel).trim()) importedSettings.styleLabel = s(rawScript.styleLabel).trim();
const tgt = n(rawScript.targetSeconds);
if (tgt!= null) importedSettings.targetSeconds = tgt;
if (typeof rawScript.snapshotStylePreset === "string") importedSettings.stylePreset = rawScript.snapshotStylePreset;
if (typeof rawScript.snapshotStyleCustom === "string") importedSettings.styleCustom = rawScript.snapshotStyleCustom;

return {
kind: "json",
fileName,
script,
issues,
importedSettings: Object.keys(importedSettings).length > 0? importedSettings: null,
};
}

// ---------------------------------------------------------------------------
// Shared dialogue-line parsing（台词行）
// 说话人（**情绪**）："台词" / 说话人（情绪）：台词 / 说话人："台词" / 说话人：台词
// ---------------------------------------------------------------------------

interface DialogueHit {
speaker: string;
emotion: string;
line: string;
}

function parseDialogueText(text: string): DialogueHit | null {
const t = text.trim();
const m = t.match(
/^([^：:（(]{1,24}?)\s*(?:（\*\*(.+?)\*\*）|（([^）]*?)）|\(([^)]*?)\))?\s*[：:]\s*(.+)$/,
);
if (!m) return null;
const speaker = (m[1]?? "").trim();
const emotion = (m[2]?? m[3]?? m[4]?? "").trim();
let line = (m[5]?? "").trim();
if (!speaker ||!line) return null;
line = stripQuotes(line);
if (!line) return null;
return { speaker, emotion, line};
}

/** formatBeatLines style: 说话人（音色，情绪语气）："台词" */
function parseStoryboardDialogue(text: string): DialogueHit | "silent" | null {
const t = text.trim();
if (t.startsWith("（无台词")) return "silent";
const m = t.match(/^([^（(]{1,24}?)（([^）]*?)）\s*[：:]\s*(.+)$/);
if (!m) return null;
const speaker = (m[1]?? "").trim();
const inside = (m[2]?? "").split(/[，,]/).map((x) => x.trim()).filter(Boolean);
let emotion = inside.length > 0? (inside[inside.length - 1]?? ""): "";
if (emotion.endsWith("语气")) emotion = emotion.slice(0, -2);
const line = stripQuotes((m[3]?? "").trim());
if (!speaker ||!line) return null;
return { speaker, emotion, line};
}

// ---------------------------------------------------------------------------
// Markdown（剧本格式01 / 审查稿导出）
// ---------------------------------------------------------------------------

const DERIVED_SECTIONS = ["全局规范", "覆盖台词清单", "台词本", "时间总规划", "角色锁定", "生成清单"];

function headingKey(heading: string): string {
// Strip leading 一、 / 1、 / ⚠️ etc. so 一、基本信息 and 基本信息 match.
return heading
.replace(/^[一二三四五六七八九十百\d]+\s*[、.．]\s*/, "")
.replace(/^⚠️\s*/, "")
.trim();
}

function splitTableRow(line: string): string[] | null {
const t = line.trim();
if (!t.startsWith("|")) return null;
const cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
return cells;
}

function isSeparatorRow(cells: string[]): boolean {
return cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "");
}

function parseMarkdownImport(fileName: string, content: string): ScriptImportResult {
const lines = content.split(/\r?\n/);
const issues: ImportIssue[] = [];
let title = "";
const importedSettings: ImportedSettings = {};
const pendingItems: string[] = [];
let synopsis = "";
const characterRows: CharacterRow[] = [];
const tempStates: Record<string, TempCharacterState> = {};
const groups: ScriptGroup[] = [];
const overlaysRaw: { type: string; timecode: string; content: string}[] = [];
const generationNotes: string[] = [];
let versionNote = "";
let generatedAt = "";

let section = ""; // current ## section key
let currentGroup: ScriptGroup | null = null;
let currentBeat: Beat | null = null;
const synopsisLines: string[] = [];
const versionLines: string[] = [];

const pushBeat = () => {
if (currentBeat && currentGroup) currentGroup.beats.push(currentBeat);
currentBeat = null;
};
const newBeat = (): Beat => {
pushBeat();
currentBeat = { visual: "", sfx: "", speaker: "", emotion: "", line: "", actionSeconds: 2};
return currentBeat;
};

const startGroup = (headingText: string) => {
pushBeat();
const m = headingText.match(/(?:段落|镜头)\s*\d+\s*[｜|]\s*(.+)$/);
const gTitle = (m?.[1]?? headingText).replace(/（[^）]*）\s*$/, "").trim() || `段落${groups.length + 1}`;
currentGroup = { title: gTitle, sceneName: "", beats: []};
groups.push(currentGroup);
section = "__group__";
};

lines.forEach((rawLine, idx) => {
const lineNo = idx + 1;
const line = rawLine.trimEnd();
const t = line.trim();

// Title
if (!title && /^#\s+/.test(t) &&!t.startsWith("##")) {
title = t.replace(/^#\s+/, "").replace(/（剧本格式01）\s*$/, "").trim();
return;
}

// ### sub-headings: groups inside 正文（逐镜头）, or beat-adjacent notes
if (/^###\s+/.test(t)) {
const h = t.replace(/^###\s+/, "");
if (/(?:段落|镜头)\s*\d+\s*[｜|]/.test(h)) {
startGroup(h);
return;
}
if (section === "__group__" || section === "正文" || section === "剧本编写" || section === "剧本正文") {
issues.push({ lineNo, text: rawLine, hint: "这个小标题没认出来，它下面的内容仍按节拍逐行解析；认不出的行会逐行列在这里。"});
return;
}
return;
}

// ## sections
if (/^##\s+/.test(t)) {
pushBeat();
const h = t.replace(/^##\s+/, "");
const key = headingKey(h);
if (/(?:段落|镜头)\s*\d+\s*[｜|]/.test(h)) {
startGroup(h);
return;
}
if (key.startsWith("待确认事项")) { section = "待确认事项"; return;}
if (key.startsWith("基本信息")) { section = "基本信息"; return;}
if (key.startsWith("故事梗概") || key.startsWith("梗概")) { section = "故事梗概"; return;}
if (key.startsWith("临时人物表")) { section = "临时人物表"; return;}
if (key.startsWith("人物表")) { section = "人物表"; return;}
if (key.startsWith("正文") || key.startsWith("剧本编写") || key.startsWith("剧本正文")) { section = "正文"; currentGroup = null; return;}
if (key.startsWith("后期叠加清单") || key.startsWith("叠加清单")) { section = "后期叠加清单"; return;}
if (key.startsWith("生成备注")) { section = "生成备注"; return;}
if (key.startsWith("版本说明")) { section = "版本说明"; return;}
if (DERIVED_SECTIONS.some((d) => key.startsWith(d))) {
section = "__skip__";
issues.push({
lineNo,
text: rawLine,
hint: `「${key}」是导出时按剧本自动算出的内容，导入时整节跳过，导入后会按新稿重新计算，不会丢剧本正文。`,
});
return;
}
section = "__unknown__";
issues.push({
lineNo,
text: rawLine,
hint: "这一节的标题没认出来，这一节的内容不会被导入。可用标题：一、基本信息 / 二、故事梗概 / 三、人物表 / 四、剧本编写（或正文）/ 后期叠加清单 / 生成备注 / 版本说明。",
});
return;
}

if (!t) return;

switch (section) {
case "待确认事项": {
if (t.startsWith("- ")) pendingItems.push(t.slice(2).trim());
else issues.push({ lineNo, text: rawLine, hint: "待确认事项里这一行不是「- 」开头的条目，没有导入。"});
return;
}
case "基本信息": {
const cells = splitTableRow(t);
if (cells && cells.length >= 2 &&!isSeparatorRow(cells)) {
const [k, v] = [cells[0]?? "", cells[1]?? ""];
if (k === "片名" && v) title = title || v;
else if (k === "语速") { const r = n(v.replace(/[^0-9.]/g, "")); if (r!= null && r > 0) importedSettings.speechRate = r;}
else if (k === "风格" && v) importedSettings.styleLabel = v;
else if (k === "目标时长") { const r = n(v.replace(/[^0-9.]/g, "")); if (r!= null) importedSettings.targetSeconds = r;}
}
return;
}
case "故事梗概": {
synopsisLines.push(t);
return;
}
case "人物表": {
const cells = splitTableRow(t);
if (cells && cells.length >= 2) {
if (isSeparatorRow(cells) || (cells[0]?? "") === "人物") return;
const name = (cells[0]?? "").trim();
if (name) {
characterRows.push({
name,
identity: cells[1]?? "",
look: cells[2]?? "",
voice: cells[3]?? "",
tone: cells[4]?? "",
});
}
return;
}
issues.push({ lineNo, text: rawLine, hint: "人物表里这一行不是表格行（| 人物 | 身份 | 造型 | 音色 | 语气基调 |），没有导入。"});
return;
}
case "临时人物表": {
const cells = splitTableRow(t);
if (cells && cells.length >= 3) {
if (isSeparatorRow(cells) || (cells[0]?? "") === "人物") return;
const name = (cells[0]?? "").trim();
const status = cells[2]?? "";
const cell = (v: string | undefined) => (v && v!== "未填写"? v: "");
if (name) {
tempStates[name] = {
disposition: status.includes("群演")? "extra": "pending",
look: cell(cells[4]),
voice: cell(cells[5]),
tone: cell(cells[6]),
kind: (cells[1]?? "").includes("群像")? "group": "single",
};
}
return;
}
return;
}
case "正文": {
// Waiting for the first ### 镜头 / ## 段落 heading.
issues.push({ lineNo, text: rawLine, hint: "正文开始后、第一个段落/镜头标题之前的这一行没有归属，没有导入。请把它放到某个「段落N｜标题」或「镜头N｜标题」下面。"});
return;
}
case "__group__": {
if (!currentGroup) return;
if (t.startsWith("场景：") || t.startsWith("场景:")) {
currentGroup.sceneName = t.replace(/^场景\s*[：:]\s*/, "").trim();
return;
}
const beatStart = t.match(/^\*\*节拍\s*\d+\*\*/);
if (beatStart) { newBeat(); return;}
// formatBeatLines style: 节拍N｜…（v4.97 起标题行不再带镜头内进度；
// 旧导出仍是 节拍N（镜头内进度 …）｜…，两种都要能认出来分拍）
if (/^节拍\s*\d+\s*[（｜]/.test(t)) { newBeat(); return;}
const visualM = t.match(/^-\s*画面\s*[：:]\s*(.*)$/)?? t.match(/^画面内容\s*[：:]\s*(.*)$/);
if (visualM) {
const b = currentBeat?? newBeat();
b.visual = (visualM[1]?? "").trim();
return;
}
const sfxM = t.match(/^-\s*音效\s*[：:]\s*(.*)$/)?? t.match(/^音效\s*[：:]\s*(.*)$/);
if (sfxM) {
const b = currentBeat?? newBeat();
b.sfx = (sfxM[1]?? "").trim();
return;
}
const actM = t.match(/^-\s*(?:动作时长|动作秒数|动作时间)\s*[：:]\s*([0-9.]+)/);
if (actM) {
const b = currentBeat?? newBeat();
b.actionSeconds = n(actM[1])?? b.actionSeconds;
return;
}
const dlgM = t.match(/^-\s*台词\s*[：:]\s*(.*)$/);
if (dlgM) {
const hit = parseDialogueText(dlgM[1]?? "");
const b = currentBeat?? newBeat();
if (hit) {
b.speaker = hit.speaker; b.emotion = hit.emotion; b.line = hit.line; b.actionSeconds = 0;
} else {
issues.push({ lineNo, text: rawLine, hint: "这行台词没解析出说话人，已按空说话人导入（会进待确认清单）。建议写成：台词：说话人（**情绪**）：\"台词内容\"。"});
b.line = stripQuotes((dlgM[1]?? "").trim());
b.actionSeconds = 0;
}
return;
}
const sbDlgM = t.match(/^人物对话\s*[：:]\s*(.*)$/);
if (sbDlgM) {
const hit = parseStoryboardDialogue(sbDlgM[1]?? "");
const b = currentBeat?? newBeat();
if (hit === "silent") return;
if (hit) {
b.speaker = hit.speaker; b.emotion = hit.emotion; b.line = hit.line; b.actionSeconds = 0;
} else {
issues.push({ lineNo, text: rawLine, hint: "这行人物对话没解析出来，没有导入到这个节拍。建议写成：人物对话：说话人（情绪）：\"台词内容\"。"});
}
return;
}
// Boilerplate lines from the storyboard Markdown export.
if (
t.startsWith("画面内无烧录文字") ||
t.startsWith("快切感") ||
t.startsWith("运镜") ||
t.startsWith("【") ||
t.includes("首帧重叠") ||
t.startsWith("字幕与正文台词逐字一致")
) {
return;
}
// A bare dialogue line directly under a group (hand-edited files).
const bare = parseDialogueText(t.replace(/^-\s*/, ""));
if (bare && (t.includes("：") || t.includes(":"))) {
const b = newBeat();
b.speaker = bare.speaker; b.emotion = bare.emotion; b.line = bare.line; b.actionSeconds = 0;
return;
}
issues.push({
lineNo,
text: rawLine,
hint: "这一行没认出来，没有导入。节拍请以「**节拍1**」开头，内容行写成「- 画面：…」「- 台词：说话人（**情绪**）：\"…\"」「- 音效：…」。",
});
return;
}
case "后期叠加清单": {
if (t === "（无）") return;
if (t.startsWith("字幕与正文台词逐字一致")) return;
const cells = splitTableRow(t);
if (cells && cells.length >= 3) {
if (isSeparatorRow(cells) || (cells[0]?? "") === "类型") return;
overlaysRaw.push({ type: cells[0]?? "花字", timecode: cells[1]?? "", content: cells[2]?? ""});
return;
}
const m = t.match(/^-\s*([^：:]{1,12})\s*[：:]\s*(.+)$/);
if (m) {
overlaysRaw.push({ type: (m[1]?? "花字").trim(), timecode: "", content: (m[2]?? "").trim()});
return;
}
issues.push({ lineNo, text: rawLine, hint: "叠加清单里这一行不是表格行也没有写成「- 类型：内容」，没有导入。"});
return;
}
case "生成备注": {
if (t.startsWith("- ")) generationNotes.push(t.slice(2).trim());
else generationNotes.push(t);
return;
}
case "版本说明": {
const gen = t.match(/生成于\s*([^；）]+)/);
if (gen &&!generatedAt) {
const d = Date.parse((gen[1]?? "").replace(/[年月]/g, "-").replace(/日/g, ""));
if (!Number.isNaN(d)) generatedAt = new Date(d).toISOString();
}
if (t.startsWith("（本稿由")) return;
versionLines.push(t);
return;
}
case "__skip__": {
return;
}
case "__unknown__": {
issues.push({ lineNo, text: rawLine, hint: "这一行属于上面那个没认出来的小节，没有导入。"});
return;
}
default: {
issues.push({ lineNo, text: rawLine, hint: "这一行不在任何小节里，没有导入。请把它放进对应的小节（一、基本信息 / 二、故事梗概 / 三、人物表 / 四、剧本编写 …）下面。"});
return;
}
}
});
pushBeat();

synopsis = synopsisLines.join("\n").trim();
versionNote = versionLines.join("\n").trim();

const cleanGroups = groups.filter((g) => {
if (g.beats.length > 0) return true;
issues.push({ lineNo: 0, text: `段落「${g.title}」没有任何节拍`, hint: "这一段在导入时被跳过：请给这一段补上至少一个节拍（**节拍1** 开头）再导入。"});
return false;
});
if (cleanGroups.length === 0) {
throw new Error(
"导入失败：没有从这个 Markdown 里解析出带节拍的段落。请确认正文写在「四、剧本编写」或「正文」下面，段落标题写成「段落1｜标题」或「镜头1｜标题」，每个节拍以「**节拍1**」开头，台词行写成「- 台词：说话人（**情绪**）：\"…\"」。当前稿没有被改动。",
);
}

// Resolve overlay group indexes from their exported timecodes when
// possible (groups are timed at the imported/default rate here; the
// caller re-times with the effective rate, and overlay anchoring is
// best-effort by design).
const rate = importedSettings.speechRate?? 5;
const starts: number[] = [];
{
let cursor = 0;
for (const g of cleanGroups) {
starts.push(cursor);
for (const b of g.beats) {
cursor += (b.line.trim()? b.line.replace(/[\s\p{P}]/gu, "").length / rate: 0) + (b.line.trim()? 0: b.actionSeconds);
}
}
}
const parseTc = (tc: string): number | null => {
const m = tc.match(/(\d+):(\d+(?:\.\d+)?)/);
if (!m) return null;
return Number(m[1]) * 60 + Number(m[2]);
};
const overlays: Overlay[] = overlaysRaw.map((o) => {
const sec = parseTc(o.timecode);
let gi = 0;
if (sec!= null) {
for (let i = 0; i < starts.length; i++) if ((starts[i]?? 0) <= sec + 0.05) gi = i;
}
return { type: o.type || "花字", groupIndex: gi, content: o.content};
});

const script: ScriptData = {
title: title || baseTitle(fileName),
pendingItems,
synopsis,
characterRows,
groups: cleanGroups,
overlays,
generationNotes,
versionNote: versionNote || "外部导入的剧本（原文件未填写版本说明）",
speechRate: importedSettings.speechRate?? 5,
styleLabel: importedSettings.styleLabel?? "",
targetSeconds: importedSettings.targetSeconds?? 0,
generatedAt: generatedAt || new Date().toISOString(),
stage: "review",
tempCharacterStates: Object.keys(tempStates).length > 0? tempStates: undefined,
};

return {
kind: "markdown",
fileName,
script,
issues,
importedSettings: Object.keys(importedSettings).length > 0? importedSettings: null,
};
}

// ---------------------------------------------------------------------------
// Plain text（纯文本剧本）
// 段落N｜标题 / 第N段 标题 → 新段落
// 画面：… → 无台词节拍；音效：… → 挂到当前节拍
// 说话人：台词 / 说话人（情绪）：台词 → 台词节拍
// ---------------------------------------------------------------------------

function parseTextImport(fileName: string, content: string): ScriptImportResult {
const lines = content.split(/\r?\n/);
const issues: ImportIssue[] = [];
const groups: ScriptGroup[] = [];
let currentGroup: ScriptGroup | null = null;
let currentBeat: Beat | null = null;
let title = "";

const ensureGroup = (): ScriptGroup => {
if (!currentGroup) {
currentGroup = { title: `段落${groups.length + 1}`, sceneName: "", beats: []};
groups.push(currentGroup);
}
return currentGroup;
};
const newBeat = (): Beat => {
currentBeat = { visual: "", sfx: "", speaker: "", emotion: "", line: "", actionSeconds: 2};
ensureGroup().beats.push(currentBeat);
return currentBeat;
};

lines.forEach((rawLine, idx) => {
const lineNo = idx + 1;
const t = rawLine.trim();
if (!t) return;

if (!title && /^#\s+/.test(t)) { title = t.replace(/^#\s+/, "").trim(); return;}

const groupM =
t.match(/^(?:段落|第)\s*(\d+)\s*(?:段)?\s*[｜|：:、.．]\s*(.+)$/)??
t.match(/^【(?:段落|场景)\s*\d+】\s*(.+)$/);
if (groupM) {
currentGroup = { title: (groupM[2]?? groupM[1]?? "").trim() || `段落${groups.length + 1}`, sceneName: "", beats: []};
groups.push(currentGroup);
currentBeat = null;
return;
}
const sceneM = t.match(/^场景\s*[：:]\s*(.+)$/);
if (sceneM) { ensureGroup().sceneName = (sceneM[1]?? "").trim(); return;}

const visualM = t.match(/^(?:【画面】|画面)\s*[：:]?\s*(.+)$/);
if (visualM) { newBeat().visual = (visualM[1]?? "").trim(); return;}

const sfxM = t.match(/^音效\s*[：:]\s*(.+)$/);
if (sfxM) { (currentBeat?? newBeat()).sfx = (sfxM[1]?? "").trim(); return;}

const actM = t.match(/^(?:动作时长|动作秒数|动作时间)\s*[：:]\s*([0-9.]+)/);
if (actM) { (currentBeat?? newBeat()).actionSeconds = n(actM[1])?? 2; return;}

const hit = parseDialogueText(t);
if (hit) {
const b = newBeat();
b.speaker = hit.speaker; b.emotion = hit.emotion; b.line = hit.line; b.actionSeconds = 0;
return;
}
// A lone quoted line: dialogue with an unknown speaker（待确认）.
if (/^["“「].*["”」]$/.test(t) && t.length >= 3) {
const b = newBeat();
b.line = stripQuotes(t);
b.actionSeconds = 0;
issues.push({ lineNo, text: rawLine, hint: "这一行只有台词、没有说话人，已按空说话人导入（会进待确认清单）。下次请写成「说话人：台词」。"});
return;
}
issues.push({
lineNo,
text: rawLine,
hint: "这一行没认出来，没有导入。台词请写成「说话人：台词」或「说话人（情绪）：台词」，画面请以「画面：」开头，段落请以「段落1｜标题」开头。",
});
});

const cleanGroups = groups.filter((g) => g.beats.length > 0);
if (cleanGroups.length === 0) {
throw new Error(
"导入失败：没有从这个文本里解析出任何台词或画面行。台词请一行一句、写成「说话人：台词」或「说话人（情绪）：台词」，画面行请以「画面：」开头。当前稿没有被改动。",
);
}

const script: ScriptData = {
title: title || baseTitle(fileName),
pendingItems: [],
synopsis: "",
characterRows: [],
groups: cleanGroups,
overlays: [],
generationNotes: ["由纯文本导入：梗概与人物表未在文件中提供，人物表以台词说话人为准、未登记的说话人导入后由系统自动设计加入（有台词进正式表、无台词记群演）。"],
versionNote: "外部导入的剧本（纯文本导入）",
speechRate: 5,
styleLabel: "",
targetSeconds: 0,
generatedAt: new Date().toISOString(),
stage: "review",
};
return { kind: "text", fileName, script, issues, importedSettings: null};
}

// ---------------------------------------------------------------------------
// 存储上限贴合：工作台单稿的存储结构有硬上限（段落 ≤6、每段节拍
// ≤14、待确认事项 ≤4、生成备注 1–10、叠加 ≤12）。本工作台导出的
// 文件天然遵守；外部手写稿可能超限，这里在不丢文字内容的前提下
// 贴合：超长段落拆成（续）段、段落过多时把末尾段落的节拍折进最后
// 一段的末尾节拍（文字拼接保留）、列表超限时把多余条目并进最后一
// 条。每一次拆分 / 折叠都记一条 issue，预览里看得到，不静默处理。
// ---------------------------------------------------------------------------

function fitImportCaps(script: ScriptData, issues: ImportIssue[]): void {
  // Split groups with more than 14 beats into （续） groups.
  const split: ScriptGroup[] = [];
  for (const g of script.groups) {
    if (g.beats.length <= 14) {
      split.push(g);
      continue;
    }
    const chunks: Beat[][] = [];
    for (let i = 0; i < g.beats.length; i += 14) chunks.push(g.beats.slice(i, i + 14));
    chunks.forEach((beats, ci) => {
      split.push({
        title: ci === 0 ? g.title : `${g.title}（续${ci + 1}）`,
        sceneName: g.sceneName,
        beats,
      });
    });
    issues.push({
      lineNo: 0,
      text: `段落「${g.title}」有 ${g.beats.length} 个节拍`,
      hint: "工作台每段最多 14 个节拍，已自动拆成（续）段，节拍和台词一个没丢；导入后可以在审查页改段落标题。",
    });
  }
  script.groups = split;

  // More than 6 groups: fold the tail groups' beats into the last
  // group, folding overflow beats into its final beat (text kept).
  if (script.groups.length > 6) {
    const kept = script.groups.slice(0, 6);
    const tail = script.groups.slice(6);
    const last = kept[kept.length - 1];
    if (last) {
      for (const g of tail) {
        for (const b of g.beats) {
          if (last.beats.length < 14) {
            last.beats.push(b);
          } else {
            const lb = last.beats[last.beats.length - 1];
            if (lb) {
              if (b.visual.trim()) lb.visual = lb.visual ? `${lb.visual}；${b.visual}` : b.visual;
              if (b.sfx.trim()) lb.sfx = lb.sfx ? `${lb.sfx}、${b.sfx}` : b.sfx;
              if (b.line.trim()) {
                lb.line = lb.line ? `${lb.line} ${b.line}` : b.line;
                if (!lb.speaker.trim()) lb.speaker = b.speaker;
                if (!lb.emotion.trim()) lb.emotion = b.emotion;
                lb.actionSeconds = 0;
              }
            }
          }
        }
      }
      issues.push({
        lineNo: 0,
        text: `全稿共 ${script.groups.length} 段（${tail.map((g) => g.title).join("、")} 在第 6 段之后）`,
        hint: "工作台单稿最多 6 段，第 6 段之后的节拍已折进最后一段（文字都保留、节拍边界有合并）。想分开保存，请在原文件里把全稿拆成两份分别导入到两个项目。",
      });
    }
    script.groups = kept;
  }

  if (script.pendingItems.length > 4) {
    const extra = script.pendingItems.slice(3);
    script.pendingItems = [
      ...script.pendingItems.slice(0, 3),
      extra.join("；另："),
    ];
    issues.push({
      lineNo: 0,
      text: `待确认事项共 ${extra.length + 3} 条`,
      hint: "工作台待确认事项最多 4 条，多出的已并进最后一条（用「另：」隔开），内容没丢。",
    });
  }
  if (script.generationNotes.length === 0) {
    script.generationNotes = ["由外部文件导入（原文件未提供生成备注）。"];
  } else if (script.generationNotes.length > 10) {
    const extra = script.generationNotes.slice(9);
    script.generationNotes = [...script.generationNotes.slice(0, 9), extra.join("；")];
    issues.push({
      lineNo: 0,
      text: `生成备注共 ${extra.length + 9} 条`,
      hint: "工作台生成备注最多 10 条，多出的已并进最后一条，内容没丢。",
    });
  }
  if (script.overlays.length > 12) {
    const dropped = script.overlays.slice(12);
    script.overlays = script.overlays.slice(0, 12);
    issues.push({
      lineNo: 0,
      text: `叠加清单共 ${dropped.length + 12} 条，多出的 ${dropped.length} 条没有导入：${dropped.map((o) => `${o.type}：${o.content}`).join("；")}`,
      hint: "工作台叠加清单最多 12 条。多出的条目原文列在这里，导入后可以在审查页手动补加，或删减前面的条目后重新导入。",
    });
  }
  if (script.tempCharacterStates) {
    for (const st of Object.values(script.tempCharacterStates)) {
      st.look = st.look.slice(0, 300);
      st.voice = st.voice.slice(0, 300);
      st.tone = st.tone.slice(0, 300);
      if (st.mappedTo) st.mappedTo = st.mappedTo.slice(0, 80);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseScriptImport(fileName: string, content: string): ScriptImportResult {
const lower = fileName.toLowerCase();
const trimmed = content.trim();
if (!trimmed) {
throw new Error("导入失败：这个文件是空的。请确认选对了文件再导入，当前稿没有被改动。");
}
let result: ScriptImportResult;
if (lower.endsWith(".json") || trimmed.startsWith("{")) {
result = parseJsonImport(fileName, content);
} else if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
result = parseMarkdownImport(fileName, content);
} else if (lower.endsWith(".txt")) {
// A txt that is actually Markdown (starts with # / ##) parses better as Markdown.
result = /^#{1,2}\s/.test(trimmed)
? parseMarkdownImport(fileName, content)
: parseTextImport(fileName, content);
} else {
throw new Error("导入失败：只支持 .json（导出的项目/剧本文件）、.md（剧本格式01 全文）、.txt（纯文本剧本）三种文件。请把文件另存为其中一种再导入。");
}
fitImportCaps(result.script, result.issues);
return result;
}

// ---------------------------------------------------------------------------
// Preview helpers
// ---------------------------------------------------------------------------

export interface ImportPreviewData {
groupCount: number;
beatCount: number;
lineCount: number;
totalSeconds: number;
dialogueSeconds: number;
actionSeconds: number;
addedCharacters: string[];
removedCharacters: string[];
/** Speakers neither in the imported 人物表 nor in the project cards. */
pendingSpeakers: { name: string; lineCount: number}[];
emptySpeakerLines: number;
}

export function scriptCounts(script: ScriptData): { groups: number; beats: number; lines: number} {
let beats = 0;
let lines = 0;
for (const g of script.groups) {
beats += g.beats.length;
for (const b of g.beats) if (b.line.trim()) lines += 1;
}
return { groups: script.groups.length, beats, lines};
}

export function buildImportPreview(
imported: ScriptData,
current: ScriptData | null,
projectCharacterNames: string[],
): ImportPreviewData {
const counts = scriptCounts(imported);
const dur = durationSummary(imported, imported.groups);
const importedNames = new Set(imported.characterRows.map((r) => r.name.trim()).filter(Boolean));
const currentNames = new Set((current?.characterRows?? []).map((r) => r.name.trim()).filter(Boolean));
const addedCharacters = [...importedNames].filter((x) =>!currentNames.has(x));
const removedCharacters = [...currentNames].filter((x) =>!importedNames.has(x));

const known = new Set<string>([...importedNames,...projectCharacterNames.map((x) => x.trim()).filter(Boolean)]);
const pending = new Map<string, number>();
let emptySpeakerLines = 0;
for (const g of imported.groups) {
for (const b of g.beats) {
if (!b.line.trim()) continue;
const sp = b.speaker.trim();
if (!sp) { emptySpeakerLines += 1; continue;}
if (!known.has(sp)) pending.set(sp, (pending.get(sp)?? 0) + 1);
}
}
return {
groupCount: counts.groups,
beatCount: counts.beats,
lineCount: counts.lines,
totalSeconds: dur.totalSeconds,
dialogueSeconds: dur.dialogueSeconds,
actionSeconds: dur.actionSeconds,
addedCharacters,
removedCharacters,
pendingSpeakers: [...pending.entries()].map(([name, lineCount]) => ({ name, lineCount})),
emptySpeakerLines,
};
}
